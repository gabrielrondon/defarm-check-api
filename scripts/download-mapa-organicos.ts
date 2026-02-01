#!/usr/bin/env tsx
/**
 * Script para baixar dados de produtores orgânicos certificados do MAPA/CNPO
 *
 * Fonte: MAPA - Cadastro Nacional de Produtores Orgânicos (CNPO)
 * URL: https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/organicos/cadastro-nacional-de-produtores-organicos-cnpo
 *
 * Frequência: Atualizado a cada 10 dias
 *
 * Uso:
 *   npm run data:mapa-organicos
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
 * Baixa planilha atual do CNPO
 */
async function downloadCNPO(): Promise<string> {
  const url = 'https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/organicos/cadastro-nacional-de-produtores-organicos-cnpo/CNPO_MAPA_ATUAL_V2_RELOAD1.xlsx';

  logger.info(`Downloading CNPO data from MAPA...`);
  logger.info(`URL: ${url}`);

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DeFarmCheckAPI/1.0)'
      }
    });

    const outputPath = path.join(DATA_DIR, 'cnpo_mapa.xlsx');
    await fs.writeFile(outputPath, Buffer.from(response.data));

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`✅ Downloaded: ${sizeMB} MB`);
    return outputPath;

  } catch (error: any) {
    logger.error(`Failed to download CNPO data: ${error.message}`);
    throw error;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('MAPA/CNPO - Download Produtores Orgânicos');
  logger.info('='.repeat(60));

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  // Download CNPO spreadsheet
  const filepath = await downloadCNPO();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  logger.info('='.repeat(60));
  logger.info('Download Summary:');
  logger.info(`  File: ${filepath}`);
  logger.info(`  Duration: ${duration}s`);
  logger.info('='.repeat(60));
  logger.info('✅ Download completed successfully');
}

main().catch(error => {
  logger.error('Fatal error:', error.message);
  process.exit(1);
});
