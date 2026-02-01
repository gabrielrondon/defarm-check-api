#!/usr/bin/env tsx
/**
 * Script para baixar focos de calor/queimadas do INPE
 *
 * Fonte: INPE - Programa Queimadas
 * URL: https://data.inpe.br/queimadas/
 *
 * Frequência: Diário (manter últimos 30-90 dias)
 *
 * Uso:
 *   npm run data:queimadas
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
 * Formata data para o padrão dos arquivos diários: YYYYMMDD
 */
function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Baixa focos de calor dos últimos 90 dias (via arquivos diários)
 * INPE não disponibiliza arquivos mensais consolidados para o ano atual,
 * mas mantém arquivos diários sempre atualizados.
 */
async function downloadDailyFires(): Promise<string> {
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  logger.info(`Downloading daily fire hotspots from ${ninetyDaysAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`);

  const allData: Buffer[] = [];
  let header: string | null = null;
  let downloadedCount = 0;
  let totalBytes = 0;

  // Download each daily file
  for (let d = new Date(ninetyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateForFilename(d);
    const filename = `focos_diario_br_${dateStr}.csv`;
    const url = `https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/${filename}`;

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'DeFarmCheckAPI/1.0'
        }
      });

      const content = Buffer.from(response.data).toString('latin1');
      const lines = content.split('\n');

      if (!header && lines.length > 0) {
        // Save header from first file
        header = lines[0];
      }

      // Add data lines (skip header)
      const dataLines = lines.slice(1).filter(line => line.trim());
      if (dataLines.length > 0) {
        allData.push(Buffer.from(dataLines.join('\n') + '\n', 'latin1'));
        totalBytes += response.data.byteLength;
        downloadedCount++;

        if (downloadedCount % 10 === 0) {
          logger.info(`Downloaded ${downloadedCount} daily files...`);
        }
      }

      // Rate limit: avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      if (error.response?.status === 404) {
        // File might not exist yet (future date or missing day)
        continue;
      }
      logger.warn(`Failed to download ${filename}: ${error.message}`);
    }
  }

  if (downloadedCount === 0) {
    throw new Error('No daily files could be downloaded');
  }

  // Combine all data
  const outputPath = path.join(DATA_DIR, 'queimadas_focos.csv');
  const combinedData = [
    Buffer.from(header + '\n', 'latin1'),
    ...allData
  ];

  await fs.writeFile(outputPath, Buffer.concat(combinedData));

  const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
  logger.info(`✅ Downloaded ${downloadedCount} daily files (${sizeMB} MB total)`);

  return outputPath;
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('INPE Queimadas - Download Focos de Calor');
  logger.info('='.repeat(60));

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const startTime = Date.now();

  // Download daily fire hotspots (last 90 days)
  const filepath = await downloadDailyFires();

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
