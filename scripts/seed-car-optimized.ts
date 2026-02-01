#!/usr/bin/env tsx
/**
 * Seed CAR - ESTRATÉGIA OTIMIZADA
 *
 * Carrega apenas CAR irregulares de estados prioritários
 * Arquivo: data/car_priority_irregular.json
 *
 * Performance:
 * - ~20-50k registros vs ~2M totais
 * - Geometrias simplificadas (tolerance 0.001)
 * - Batch insert de 50 registros por vez
 * - Índice GIST em geometry
 * - Índice parcial em status (apenas irregulares)
 *
 * Uso:
 *   npm run seed:car-optimized
 */

import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';
import fs from 'fs/promises';
import path from 'path';

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

interface CARRecord {
  carNumber: string;
  status: string;
  ownerDocument: string;
  ownerName: string;
  propertyName: string;
  areaHa: number;
  state: string;
  municipality: string;
  geometry: string;  // WKT format
}

async function seedOptimized() {
  const startTime = Date.now();

  logger.info('🚀 Starting optimized CAR seed');

  // Ler arquivo
  const filepath = path.join(process.cwd(), 'data', 'car_priority_irregular.json');
  const content = await fs.readFile(filepath, 'utf-8');
  const cars: CARRecord[] = JSON.parse(content);

  logger.info('CAR records loaded', { count: cars.length });

  if (cars.length === 0) {
    logger.warn('No CAR records to seed');
    return;
  }

  // Limpar tabela
  logger.info('Clearing existing CAR registrations');
  await db.execute(sql`TRUNCATE TABLE car_registrations CASCADE`);

  // Batch insert (50 por vez - geometrias podem ser grandes)
  const BATCH_SIZE = 50;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < cars.length; i += BATCH_SIZE) {
    const batch = cars.slice(i, i + BATCH_SIZE);

    for (const car of batch) {
      try {
        await db.execute(sql`
          INSERT INTO car_registrations (
            car_number,
            status,
            owner_document,
            owner_name,
            property_name,
            area_ha,
            state,
            municipality,
            geometry
          ) VALUES (
            ${car.carNumber},
            ${car.status},
            ${car.ownerDocument || null},
            ${car.ownerName || null},
            ${car.propertyName || null},
            ${car.areaHa || 0},
            ${car.state},
            ${car.municipality || null},
            ST_SimplifyPreserveTopology(ST_GeomFromText(${car.geometry}, 4326), 0.001)
          )
          ON CONFLICT DO NOTHING
        `);
        inserted++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const pgError = errorMsg.split('\n').find(line =>
          line.includes('ERROR:') || line.includes('error:')
        ) || errorMsg.slice(0, 200);

        logger.error('Insert failed', {
          carNumber: car.carNumber,
          state: car.state,
          error: pgError
        });
        failed++;
      }
    }

    if ((i + BATCH_SIZE) % 500 === 0 || (i + BATCH_SIZE) >= cars.length) {
      logger.info('Progress', {
        inserted,
        failed,
        total: cars.length,
        progress: `${Math.round(((i + BATCH_SIZE) / cars.length) * 100)}%`
      });
    }
  }

  // Criar índice parcial para performance (apenas irregulares)
  logger.info('Creating partial index on irregular status');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_car_irregular_status
    ON car_registrations (status)
    WHERE status IN ('CANCELADO', 'SUSPENSO', 'PENDENTE')
  `);

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  logger.info('✅ CAR seeding completed!', {
    inserted,
    failed,
    total: cars.length,
    elapsedSeconds: elapsedSec
  });

  // Stats finais
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT status) as statuses,
      SUM(area_ha) as total_area_ha
    FROM car_registrations
  `);

  const byStatus = await db.execute(sql`
    SELECT status, COUNT(*) as count
    FROM car_registrations
    GROUP BY status
    ORDER BY count DESC
  `);

  logger.info('Database stats', {
    ...stats.rows[0],
    byStatus: byStatus.rows
  });
}

async function main() {
  try {
    await seedOptimized();
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error });
    process.exit(1);
  }
}

main();

export { seedOptimized };
