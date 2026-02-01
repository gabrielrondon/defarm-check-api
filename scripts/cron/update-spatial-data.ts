#!/usr/bin/env tsx
/**
 * Cron Job: Atualização de Dados Espaciais
 *
 * Frequência: MENSAL (1º dia, 04:00)
 * Cron: 0 4 1 * *
 *
 * Atualiza dados geoespaciais que mudam raramente:
 * - Terras Indígenas (FUNAI)
 * - Unidades de Conservação (ICMBio)
 *
 * Esses dados são relativamente estáveis (mudanças < 1x/mês)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger, format, transports } from 'winston';

const execAsync = promisify(exec);

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
          return `[${ts}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({
      filename: 'logs/cron-spatial-data.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

async function updateTerrasIndigenas() {
  logger.info('Updating Terras Indígenas...');

  try {
    // Download
    logger.info('Downloading from FUNAI GeoServer...');
    await execAsync('npm run data:funai-terras-indigenas');

    // Seed
    logger.info('Seeding to database...');
    await execAsync('npm run seed:terras-indigenas data/terras_indigenas.json');

    logger.info('Terras Indígenas updated successfully');
  } catch (error) {
    logger.error('Terras Indígenas update failed', { error });
    throw error;
  }
}

async function updateUnidadesConservacao() {
  logger.info('Updating Unidades de Conservação...');

  try {
    // Download
    logger.info('Downloading from ICMBio GeoServer...');
    await execAsync('npm run data:icmbio-unidades-conservacao');

    // Seed
    logger.info('Seeding to database...');
    await execAsync('npm run seed:unidades-conservacao data/unidades_conservacao.json');

    logger.info('Unidades de Conservação updated successfully');
  } catch (error) {
    logger.error('Unidades de Conservação update failed', { error });
    throw error;
  }
}

async function main() {
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('Starting spatial data update job');
  logger.info('='.repeat(60));

  const results = {
    terrasIndigenas: false,
    unidadesConservacao: false
  };

  try {
    // 1. Terras Indígenas
    await updateTerrasIndigenas();
    results.terrasIndigenas = true;
  } catch (error) {
    logger.error('Terras Indígenas update failed, continuing...');
  }

  try {
    // 2. Unidades de Conservação
    await updateUnidadesConservacao();
    results.unidadesConservacao = true;
  } catch (error) {
    logger.error('Unidades de Conservação update failed, continuing...');
  }

  const executionTime = Math.round((Date.now() - startTime) / 1000);

  logger.info('='.repeat(60));
  logger.info('Spatial data update completed', {
    executionTimeSeconds: executionTime,
    results
  });
  logger.info('='.repeat(60));

  // Exit com erro se algum falhou
  if (!results.terrasIndigenas || !results.unidadesConservacao) {
    process.exit(1);
  }

  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as updateSpatialData };
