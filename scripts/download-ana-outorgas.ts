#!/usr/bin/env tsx
/**
 * Script para baixar dados de Outorgas de Uso de Recursos Hídricos da ANA
 *
 * Fonte: Agência Nacional de Águas e Saneamento Básico (ANA)
 * URL: https://dadosabertos.ana.gov.br/
 * Dataset: Outorgas de Direito de Uso de Recursos Hídricos
 *
 * Atualização: Contínua
 *
 * Uso:
 *   npm run data:ana-outorgas
 */

import { createLogger, format, transports } from 'winston';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      return `[${ts}] ${level}: ${message}`;
    })
  ),
  transports: [new transports.Console()]
});

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'ana_outorgas.csv');
const DOWNLOAD_URL = 'https://hub.arcgis.com/api/v3/datasets/98d419c5fb2c4c28ad60efd3872d5d5c/downloads/data?format=csv&spatialRefId=4326';

async function main() {
  logger.info('='.repeat(60));
  logger.info('ANA Outorgas - Download Dataset');
  logger.info('='.repeat(60));

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  try {
    logger.info('Downloading ANA outorgas dataset...');
    logger.info(`URL: ${DOWNLOAD_URL}`);

    const response = await axios({
      method: 'get',
      url: DOWNLOAD_URL,
      responseType: 'stream',
      timeout: 300000 // 5 minutes
    });

    const writer = (await import('fs')).createWriteStream(OUTPUT_FILE);

    let downloadedBytes = 0;
    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes % (1024 * 1024) === 0) { // Log every MB
        logger.info(`Downloaded: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = await fs.stat(OUTPUT_FILE);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info('='.repeat(60));
    logger.info('Download Summary:');
    logger.info(`  File: ${OUTPUT_FILE}`);
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
