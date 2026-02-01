#!/usr/bin/env tsx
/**
 * Script para baixar dados de sanções da CGU via API REST
 *
 * Fontes:
 * - CEIS: Cadastro de Empresas Inidôneas e Suspensas
 * - CNEP: Cadastro Nacional de Empresas Punidas (Lei Anticorrupção)
 *
 * API: https://api.portaldatransparencia.gov.br/api-de-dados/
 * Requer: CGU_API_KEY no .env
 *
 * Frequência: Mensal (atualização dia 1)
 *
 * Uso:
 *   npm run data:cgu-sancoes
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { createLogger, format, transports } from 'winston';
import dotenv from 'dotenv';

dotenv.config();

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
const API_BASE = 'https://api.portaldatransparencia.gov.br/api-de-dados';
const API_KEY = process.env.CGU_API_KEY;

if (!API_KEY) {
  logger.error('CGU_API_KEY not found in environment variables!');
  logger.error('Please set CGU_API_KEY in .env file');
  process.exit(1);
}

interface CEISRecord {
  cpfCnpjSancionado: string;
  nomeSancionado: string;
  ufSancionado?: string;
  tipoSancao: string;
  dataInicioSancao: string;
  dataFimSancao?: string;
  orgaoSancionador: string;
  numeroProcesso?: string;
  fundamentacaoLegal?: string;
}

interface CNEPRecord {
  cnpjCpfSancionado: string;
  nomeSancionado: string;
  ufSancionado?: string;
  tipoSancao: string;
  dataInicioSancao: string;
  dataFinalSancao?: string;
  orgaoSancionador: string;
  numeroProcesso?: string;
  descricao?: string;
}

/**
 * Fetch data from CGU API with pagination
 */
async function fetchWithPagination(
  endpoint: string,
  params: Record<string, any> = {}
): Promise<any[]> {
  const allData: any[] = [];
  let page = 1;
  const pageSize = 500; // Max allowed by API
  let hasMore = true;

  while (hasMore) {
    try {
      logger.info(`Fetching ${endpoint} - page ${page}...`);

      const response = await axios.get(`${API_BASE}${endpoint}`, {
        headers: {
          'chave-api-dados': API_KEY!
        },
        params: {
          ...params,
          pagina: page,
          tamanhoPagina: pageSize
        },
        timeout: 60000
      });

      const data = response.data;

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      allData.push(...data);
      logger.info(`  ✓ Fetched ${data.length} records (total: ${allData.length})`);

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }

      // Rate limit: wait 700ms between requests (max 90/min)
      await new Promise(resolve => setTimeout(resolve, 700));

    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.status === 204) {
        logger.info(`  No more data at page ${page}`);
        hasMore = false;
      } else {
        logger.error(`Error fetching page ${page}:`, error.message);
        throw error;
      }
    }
  }

  return allData;
}

/**
 * Download CEIS data
 */
async function downloadCEIS(): Promise<number> {
  logger.info('Downloading CEIS (Cadastro de Empresas Inidôneas e Suspensas)...');

  try {
    const data = await fetchWithPagination('/ceis', {});

    if (data.length === 0) {
      logger.warn('No CEIS data returned from API');
      return 0;
    }

    const outputPath = path.join(DATA_DIR, 'cgu_ceis_api.json');
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));

    logger.info(`✅ CEIS: ${data.length} records saved to ${outputPath}`);
    return data.length;

  } catch (error: any) {
    logger.error('Failed to download CEIS:', error.message);
    throw error;
  }
}

/**
 * Download CNEP data
 */
async function downloadCNEP(): Promise<number> {
  logger.info('Downloading CNEP (Cadastro Nacional de Empresas Punidas)...');

  try {
    const data = await fetchWithPagination('/cnep', {});

    if (data.length === 0) {
      logger.warn('No CNEP data returned from API');
      return 0;
    }

    const outputPath = path.join(DATA_DIR, 'cgu_cnep_api.json');
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));

    logger.info(`✅ CNEP: ${data.length} records saved to ${outputPath}`);
    return data.length;

  } catch (error: any) {
    logger.error('Failed to download CNEP:', error.message);
    throw error;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('CGU Sanções - Download via API REST');
  logger.info('='.repeat(60));
  logger.info(`API Key configured: ${API_KEY?.substring(0, 8)}...`);

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  // Download both sources
  const ceisCount = await downloadCEIS();
  const cnepCount = await downloadCNEP();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  logger.info('='.repeat(60));
  logger.info('Download Summary:');
  logger.info(`  CEIS: ${ceisCount} records`);
  logger.info(`  CNEP: ${cnepCount} records`);
  logger.info(`  Total: ${ceisCount + cnepCount} records`);
  logger.info(`  Duration: ${duration}s`);
  logger.info('='.repeat(60));

  if (ceisCount === 0 && cnepCount === 0) {
    logger.error('❌ No data downloaded!');
    process.exit(1);
  }

  logger.info('✅ Download completed successfully');
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
