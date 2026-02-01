#!/usr/bin/env tsx
/**
 * Script para baixar CAR de TODOS os estados brasileiros
 *
 * ATENÇÃO: Este script pode demorar HORAS e baixar GIGABYTES de dados!
 *
 * Volume estimado:
 * - 27 estados
 * - ~1-2 milhões de registros totais
 * - ~10-15 GB de dados JSON
 *
 * Uso:
 *   npm run data:car-all
 *
 * Ou com priorização (baixar só principais):
 *   npm run data:car-all -- --priority
 */

import { downloadCARByState } from './download-car.js';
import fs from 'fs/promises';
import path from 'path';
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

// Todos os 27 estados do Brasil
const ALL_STATES = [
  // Norte (7)
  'AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO',
  // Nordeste (9)
  'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE',
  // Centro-Oeste (4)
  'DF', 'GO', 'MS', 'MT',
  // Sudeste (4)
  'ES', 'MG', 'RJ', 'SP',
  // Sul (3)
  'PR', 'RS', 'SC'
];

// Estados prioritários (90% do agronegócio brasileiro)
const PRIORITY_STATES = [
  'MT', // Mato Grosso - soja, gado, algodão
  'PA', // Pará - gado, desmatamento
  'GO', // Goiás - soja, milho
  'MS', // Mato Grosso do Sul - soja, gado
  'RS', // Rio Grande do Sul - arroz, soja
  'PR', // Paraná - soja, milho, frango
  'SP', // São Paulo - cana, laranja
  'MG', // Minas Gerais - café, gado
  'BA', // Bahia - soja, algodão
  'TO'  // Tocantins - soja
];

async function saveToFile(cars: any[], stateCode: string) {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filename = `car_${stateCode.toLowerCase()}.json`;
  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(cars, null, 2), 'utf-8');

  logger.info(`Saved ${cars.length} CAR registrations to ${filepath}`);

  // Stats
  const totalArea = cars.reduce((sum: number, car: any) => sum + (car.areaHa || 0), 0);
  const byStatus = cars.reduce((acc: any, car: any) => {
    acc[car.status] = (acc[car.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  logger.info('Stats', {
    state: stateCode,
    totalRegistrations: cars.length,
    totalAreaHa: totalArea,
    byStatus
  });

  return filepath;
}

async function downloadAll(priorityOnly: boolean = false) {
  const states = priorityOnly ? PRIORITY_STATES : ALL_STATES;
  const startTime = Date.now();

  logger.info('Starting CAR download for multiple states', {
    mode: priorityOnly ? 'PRIORITY ONLY' : 'ALL STATES',
    stateCount: states.length,
    states: states.join(', ')
  });

  const results = {
    success: [] as string[],
    failed: [] as { state: string; error: string }[],
    totalRecords: 0,
    totalFiles: 0
  };

  for (const state of states) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Processing state: ${state} (${states.indexOf(state) + 1}/${states.length})`);
      logger.info('='.repeat(60));

      const cars = await downloadCARByState(state);

      if (cars.length > 0) {
        await saveToFile(cars, state);
        results.success.push(state);
        results.totalRecords += cars.length;
        results.totalFiles += 1;
      } else {
        logger.warn(`No CAR registrations found for ${state}`);
      }

      // Delay entre requests para não sobrecarregar o servidor
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      logger.error(`Failed to download ${state}`, {
        error: error instanceof Error ? error.message : error
      });
      results.failed.push({
        state,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue com próximo estado
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  logger.info('\n' + '='.repeat(60));
  logger.info('DOWNLOAD SUMMARY');
  logger.info('='.repeat(60));
  logger.info('Success:', {
    states: results.success.length,
    list: results.success.join(', '),
    totalRecords: results.totalRecords,
    totalFiles: results.totalFiles
  });

  if (results.failed.length > 0) {
    logger.error('Failed:', {
      states: results.failed.length,
      list: results.failed.map(f => `${f.state}: ${f.error}`).join('\n')
    });
  }

  logger.info('Execution time:', {
    totalSeconds: totalTime,
    minutes: Math.round(totalTime / 60),
    avgSecondsPerState: Math.round(totalTime / states.length)
  });

  logger.info('='.repeat(60));

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const priorityOnly = args.includes('--priority');

  try {
    const results = await downloadAll(priorityOnly);

    if (results.failed.length > 0) {
      logger.warn(`⚠️  Completed with ${results.failed.length} failures`);
      process.exit(1);
    } else {
      logger.info('✅ All states downloaded successfully');
      process.exit(0);
    }
  } catch (error) {
    logger.error('❌ Download failed', { error });
    process.exit(1);
  }
}

// Run if this is the main module (ES modules)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { downloadAll };
