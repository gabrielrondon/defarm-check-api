#!/usr/bin/env tsx
/**
 * Script para baixar dados de sanções da CGU
 *
 * Fontes:
 * - CEIS: Cadastro de Empresas Inidôneas e Suspensas
 * - CNEP: Cadastro Nacional de Empresas Punidas (Lei Anticorrupção)
 * - CEAF: Cadastro de Expulsões da Administração Federal
 *
 * Portal: https://portaldatransparencia.gov.br/
 * Dados Abertos: https://portaldatransparencia.gov.br/download-de-dados
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

/**
 * URLs dos arquivos CSV de sanções da CGU
 * Formato: YYYYMMDD (ex: 20260101)
 */
function getDownloadUrls() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  return {
    ceis: `http://arquivos.portaldatransparencia.gov.br/downloads.asp?a=${year}&m=${month}&consulta=CEIS&d=${day}`,
    cnep: `http://arquivos.portaldatransparencia.gov.br/downloads.asp?a=${year}&m=${month}&consulta=CNEP&d=${day}`,
    ceaf: `http://arquivos.portaldatransparencia.gov.br/downloads.asp?a=${year}&m=${month}&consulta=CEAF&d=${day}`
  };
}

async function downloadFile(url: string, outputPath: string, name: string): Promise<boolean> {
  try {
    logger.info(`Downloading ${name} from: ${url}`);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 10,
      timeout: 120000, // 2 minutos
      headers: {
        'User-Agent': 'DeFarmCheckAPI/1.0'
      }
    });

    await fs.writeFile(outputPath, Buffer.from(response.data));

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`✅ ${name} downloaded: ${sizeMB} MB`);
    return true;

  } catch (error: any) {
    logger.error(`❌ Failed to download ${name}:`, {
      error: error.message,
      url
    });
    return false;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('CGU Sanções - Download');
  logger.info('='.repeat(60));

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const urls = getDownloadUrls();
  const results = {
    ceis: false,
    cnep: false,
    ceaf: false
  };

  // Download CEIS
  results.ceis = await downloadFile(
    urls.ceis,
    path.join(DATA_DIR, 'cgu_ceis.csv'),
    'CEIS'
  );

  // Download CNEP
  results.cnep = await downloadFile(
    urls.cnep,
    path.join(DATA_DIR, 'cgu_cnep.csv'),
    'CNEP'
  );

  // Download CEAF
  results.ceaf = await downloadFile(
    urls.ceaf,
    path.join(DATA_DIR, 'cgu_ceaf.csv'),
    'CEAF'
  );

  // Summary
  logger.info('='.repeat(60));
  logger.info('Download Summary:');
  logger.info(`  CEIS: ${results.ceis ? '✅' : '❌'}`);
  logger.info(`  CNEP: ${results.cnep ? '✅' : '❌'}`);
  logger.info(`  CEAF: ${results.ceaf ? '✅' : '❌'}`);
  logger.info('='.repeat(60));

  const successCount = Object.values(results).filter(Boolean).length;

  if (successCount === 0) {
    logger.error('❌ All downloads failed!');
    process.exit(1);
  }

  if (successCount < 3) {
    logger.warn(`⚠️ Partial success: ${successCount}/3 files downloaded`);
    process.exit(0); // Not fatal - can work with partial data
  }

  logger.info('✅ All files downloaded successfully');
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
