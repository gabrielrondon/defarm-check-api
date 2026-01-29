#!/usr/bin/env tsx
/**
 * Script para fazer seed de CAR de TODOS os estados no PostgreSQL
 *
 * Procura por todos os arquivos car_*.json em data/ e faz seed
 *
 * Uso:
 *   npm run seed:car-all
 */

import fs from 'fs/promises';
import path from 'path';
import { seedCAR } from './seed-car.js';
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

async function findCARFiles(): Promise<string[]> {
  const dataDir = path.join(process.cwd(), 'data');

  try {
    const files = await fs.readdir(dataDir);
    const carFiles = files
      .filter(file => file.startsWith('car_') && file.endsWith('.json'))
      .map(file => path.join(dataDir, file));

    return carFiles;
  } catch (error) {
    logger.error('Failed to read data directory', { error });
    return [];
  }
}

async function seedAll() {
  const startTime = Date.now();

  logger.info('Starting CAR seed for all states');

  // Encontrar todos os arquivos CAR
  const carFiles = await findCARFiles();

  if (carFiles.length === 0) {
    logger.warn('No CAR files found in data/ directory');
    logger.warn('Run "npm run data:car-all" first to download data');
    return;
  }

  logger.info(`Found ${carFiles.length} CAR files to seed`);

  const results = {
    success: [] as string[],
    failed: [] as { file: string; error: string }[],
    totalRecords: 0
  };

  for (const filepath of carFiles) {
    const filename = path.basename(filepath);

    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Processing: ${filename} (${carFiles.indexOf(filepath) + 1}/${carFiles.length})`);
      logger.info('='.repeat(60));

      await seedCAR(filepath);

      results.success.push(filename);

      // Contar registros
      const content = await fs.readFile(filepath, 'utf-8');
      const cars = JSON.parse(content);
      results.totalRecords += cars.length;

    } catch (error) {
      logger.error(`Failed to seed ${filename}`, {
        error: error instanceof Error ? error.message : error
      });
      results.failed.push({
        file: filename,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue com próximo arquivo
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  logger.info('\n' + '='.repeat(60));
  logger.info('SEED SUMMARY');
  logger.info('='.repeat(60));
  logger.info('Success:', {
    files: results.success.length,
    totalRecords: results.totalRecords,
    list: results.success.join(', ')
  });

  if (results.failed.length > 0) {
    logger.error('Failed:', {
      files: results.failed.length,
      list: results.failed.map(f => `${f.file}: ${f.error}`).join('\n')
    });
  }

  logger.info('Execution time:', {
    totalSeconds: totalTime,
    minutes: Math.round(totalTime / 60)
  });

  logger.info('='.repeat(60));

  return results;
}

async function main() {
  try {
    const results = await seedAll();

    if (results && results.failed.length > 0) {
      logger.warn(`⚠️  Completed with ${results.failed.length} failures`);
      process.exit(1);
    } else {
      logger.info('✅ All CAR files seeded successfully');
      process.exit(0);
    }
  } catch (error) {
    logger.error('❌ Seed failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedAll };
