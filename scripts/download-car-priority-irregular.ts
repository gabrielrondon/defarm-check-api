#!/usr/bin/env tsx
/**
 * Download CAR - ESTRATÉGIA OTIMIZADA
 *
 * Baixa APENAS:
 * 1. Estados prioritários (10 estados = 90% do agro brasileiro)
 * 2. CAR com status IRREGULAR (Cancelado, Suspenso, Pendente)
 *
 * Benefícios:
 * - Dataset reduzido de ~2M registros para ~20-50k
 * - Foca em casos problemáticos (risk-based approach)
 * - Viável para Railway free tier
 *
 * Limitações:
 * - Não cobre todos os 27 estados (apenas 10 principais)
 * - Não detecta "ausência de CAR" (apenas CAR irregular)
 *
 * Lógica do checker:
 * - Se NÃO encontrar CAR irregular = PASS ✅ (presumivelmente regular)
 * - Se encontrar CAR irregular = FAIL ❌ (confirmado irregular)
 *
 * Uso:
 *   npm run data:car-optimized
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

// Estados prioritários (90% do agronegócio brasileiro)
const PRIORITY_STATES = [
  'MT', // Mato Grosso - soja, gado, algodão (líder nacional)
  'PA', // Pará - gado, desmatamento (área crítica)
  'GO', // Goiás - soja, milho
  'MS', // Mato Grosso do Sul - soja, gado
  'RS', // Rio Grande do Sul - arroz, soja
  'PR', // Paraná - soja, milho, frango
  'SP', // São Paulo - cana, laranja
  'MG', // Minas Gerais - café, gado
  'BA', // Bahia - soja, algodão
  'TO'  // Tocantins - soja, fronteira agrícola
];

// Status irregulares que queremos rastrear
const IRREGULAR_STATUS = ['CANCELADO', 'SUSPENSO', 'PENDENTE'];

async function downloadOptimized() {
  const startTime = Date.now();
  const allIrregularCAR: any[] = [];

  logger.info('🚀 Starting OPTIMIZED CAR download', {
    strategy: 'Priority States + Irregular Status Only',
    states: PRIORITY_STATES.join(', '),
    irregularStatus: IRREGULAR_STATUS.join(', ')
  });

  for (const state of PRIORITY_STATES) {
    try {
      logger.info(`\n📍 Processing state: ${state}`);

      // Download CAR do estado
      const stateCARs = await downloadCARByState(state);

      // Filtrar apenas irregulares
      const irregular = stateCARs.filter(car =>
        IRREGULAR_STATUS.includes(car.status.toUpperCase())
      );

      logger.info(`Filtered irregular CAR`, {
        state,
        total: stateCARs.length,
        irregular: irregular.length,
        percentage: ((irregular.length / stateCARs.length) * 100).toFixed(1) + '%'
      });

      allIrregularCAR.push(...irregular);

      // Sleep para não sobrecarregar o servidor
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      logger.error(`Failed to download ${state}`, { error: err });
      // Continuar com próximo estado
    }
  }

  // Salvar arquivo consolidado
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filename = 'car_priority_irregular.json';
  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(allIrregularCAR, null, 2), 'utf-8');

  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Stats finais
  const byStatus = allIrregularCAR.reduce((acc: any, car: any) => {
    acc[car.status] = (acc[car.status] || 0) + 1;
    return acc;
  }, {});

  const byState = allIrregularCAR.reduce((acc: any, car: any) => {
    acc[car.state] = (acc[car.state] || 0) + 1;
    return acc;
  }, {});

  logger.info('\n✅ OPTIMIZED CAR download completed!', {
    totalIrregular: allIrregularCAR.length,
    statesProcessed: PRIORITY_STATES.length,
    byStatus,
    byState,
    savedTo: filepath,
    elapsedMinutes: elapsedMin
  });

  logger.info('\n💡 Next steps:', {
    seed: 'npm run seed:car-optimized',
    benchmark: 'npm run benchmark:spatial'
  });
}

async function main() {
  try {
    await downloadOptimized();
    process.exit(0);
  } catch (error) {
    logger.error('Download failed', { error });
    process.exit(1);
  }
}

main();

export { downloadOptimized };
