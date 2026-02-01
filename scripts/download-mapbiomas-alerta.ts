#!/usr/bin/env tsx
/**
 * Script para baixar alertas de desmatamento validados do MapBiomas Alerta
 *
 * Fonte: MapBiomas Alerta (desmatamento validado por analistas)
 * URL: https://alerta.mapbiomas.org/
 * API: https://plataforma.alerta.mapbiomas.org/api/v2/graphql
 *
 * Frequência: Atualizado semanalmente
 *
 * IMPORTANTE: Requer autenticação
 * - Criar conta em: https://plataforma.alerta.mapbiomas.org/sign-in
 * - Configurar .env:
 *   MAPBIOMAS_EMAIL=seu@email.com
 *   MAPBIOMAS_PASSWORD=sua-senha
 *
 * Uso:
 *   npm run data:mapbiomas-alerta
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      const metaStr = Object.keys(meta).length ? '\n    ' + JSON.stringify(meta, null, 2) : '';
      return `[${ts}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [new transports.Console()]
});

const DATA_DIR = path.join(process.cwd(), 'data');
const GRAPHQL_ENDPOINT = 'https://plataforma.alerta.mapbiomas.org/api/v2/graphql';

interface MapBiomasConfig {
  email?: string;
  password?: string;
  startDate?: string;
  endDate?: string;
  minAreaHa?: number;
  states?: string[];
}

/**
 * Autentica e obtém Bearer token
 */
async function authenticate(email: string, password: string): Promise<string> {
  logger.info('Authenticating with MapBiomas Alerta API...');

  const mutation = `
    mutation SignIn($email: String!, $password: String!) {
      signIn(email: $email, password: $password) {
        token
      }
    }
  `;

  try {
    const response = await axios.post(GRAPHQL_ENDPOINT, {
      query: mutation,
      variables: { email, password }
    });

    if (response.data.errors) {
      throw new Error(`Authentication failed: ${JSON.stringify(response.data.errors)}`);
    }

    const token = response.data.data.signIn.token;
    logger.info('✅ Authentication successful');
    return token;
  } catch (error: any) {
    logger.error(`Authentication error: ${error.message}`);
    throw error;
  }
}

/**
 * Busca alertas via GraphQL API
 */
async function fetchAlerts(token: string, config: MapBiomasConfig): Promise<any[]> {
  logger.info('Fetching alerts from MapBiomas Alerta API...');

  // Query simplificada com apenas campos escalares básicos
  const query = `
    query GetAlerts(
      $startDate: BaseDate!
      $endDate: BaseDate
      $startSize: Float
      $page: Int!
      $limit: Int!
    ) {
      alerts(
        startDate: $startDate
        endDate: $endDate
        dateType: PublishedAt
        startSize: $startSize
        statusName: "published"
        page: $page
        limit: $limit
        sortField: DETECTED_AT
        sortDirection: DESC
      ) {
        collection {
          alertCode
          areaHa
          detectedAt
          publishedAt
          deforestationClasses
          deforestationSpeed
          sources
          statusName
          geometryWkt
          ruralPropertiesCodes
          crossedStates
          crossedCities
          crossedBiomes
          crossedIndigenousLands
          crossedConservationUnits
        }
        metadata {
          currentPage
          totalCount
          totalPages
          limitValue
        }
      }
    }
  `;

  const variables = {
    startDate: config.startDate || '2024-01-01',
    endDate: config.endDate || new Date().toISOString().split('T')[0],
    startSize: config.minAreaHa || 1.0, // Minimum 1 hectare
    page: 1,
    limit: 100 // Max per request
  };

  const allAlerts: any[] = [];
  let currentPage = 1;
  let totalPages = 1;

  try {
    do {
      variables.page = currentPage;

      const response = await axios.post(
        GRAPHQL_ENDPOINT,
        { query, variables },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 2 minutes
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }

      const result = response.data.data.alerts;
      const alerts = result.collection;
      const metadata = result.metadata;

      allAlerts.push(...alerts);
      totalPages = metadata.totalPages;

      logger.info(`Downloaded page ${currentPage}/${totalPages} (${alerts.length} alerts, total: ${allAlerts.length}/${metadata.totalCount})`);

      currentPage++;

      // Rate limiting - wait 1 second between requests
      if (currentPage <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } while (currentPage <= totalPages);

    logger.info(`✅ Downloaded ${allAlerts.length} alerts in total`);
    return allAlerts;

  } catch (error: any) {
    logger.error(`Error fetching alerts: ${error.message}`);
    throw error;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('MapBiomas Alerta - Download Validated Deforestation Alerts');
  logger.info('='.repeat(60));

  // Check credentials
  const email = process.env.MAPBIOMAS_EMAIL;
  const password = process.env.MAPBIOMAS_PASSWORD;

  if (!email || !password) {
    logger.error('Missing MapBiomas credentials!');
    logger.error('Please set MAPBIOMAS_EMAIL and MAPBIOMAS_PASSWORD in .env file');
    logger.error('Create account at: https://plataforma.alerta.mapbiomas.org/sign-in');
    process.exit(1);
  }

  // Parse command line arguments for date range
  const args = process.argv.slice(2);
  const monthsArg = args.find(arg => arg.startsWith('--months='));
  const offsetArg = args.find(arg => arg.startsWith('--offset='));
  const outputArg = args.find(arg => arg.startsWith('--output='));

  const months = monthsArg ? parseInt(monthsArg.split('=')[1]) : 6; // Default 6 months
  const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0; // Default 0 (most recent)
  const outputFile = outputArg ? outputArg.split('=')[1] : 'mapbiomas_alerta.json';

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  try {
    // Authenticate
    const token = await authenticate(email, password);

    // Calculate date range
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() - offset);

    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - months);

    logger.info(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    logger.info(`Period: ${months} months (offset: ${offset} months)`);

    const config: MapBiomasConfig = {
      email,
      password,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      minAreaHa: 1.0 // Minimum 1 hectare
    };

    const alerts = await fetchAlerts(token, config);

    // Save to JSON
    const outputPath = path.join(DATA_DIR, outputFile);
    await fs.writeFile(outputPath, JSON.stringify(alerts, null, 2));

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info('='.repeat(60));
    logger.info('Download Summary:');
    logger.info(`  Alerts: ${alerts.length}`);
    logger.info(`  File: ${outputPath}`);
    logger.info(`  Size: ${sizeMB} MB`);
    logger.info(`  Duration: ${duration}s`);
    logger.info('='.repeat(60));
    logger.info('✅ Download completed successfully');

  } catch (error: any) {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Fatal error:', error.message);
  process.exit(1);
});
