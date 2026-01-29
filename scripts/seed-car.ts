#!/usr/bin/env tsx
/**
 * Script para fazer seed de registros CAR no PostgreSQL + PostGIS
 *
 * Uso:
 *   npm run seed:car data/car_mt.json
 *   npm run seed:car data/car_pa.json
 *   npm run seed:car data/car_go.json
 */

import fs from 'fs/promises';
import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
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

interface CARRegistration {
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

async function seedCAR(filepath: string) {
  logger.info('Seeding CAR registrations to database', { filepath });

  // Ler arquivo JSON
  const content = await fs.readFile(filepath, 'utf-8');
  const cars: CARRegistration[] = JSON.parse(content);

  logger.info('CAR registrations loaded from file', { count: cars.length });

  if (cars.length === 0) {
    logger.warn('No CAR registrations to seed');
    return;
  }

  const state = cars[0]?.state || 'UNKNOWN';

  // Limpar registros do estado antes (para atualização incremental)
  logger.info('Clearing existing CAR registrations for state', { state });
  await db.execute(sql`DELETE FROM car_registrations WHERE state = ${state}`);

  // Batch insert
  let inserted = 0;
  const batchSize = 100;  // Geometrias podem ser grandes

  for (let i = 0; i < cars.length; i += batchSize) {
    const batch = cars.slice(i, i + batchSize);

    const values = batch.map(car => {
      // Escapar aspas simples em strings
      const escapeSql = (str: string) => str.replace(/'/g, "''");

      return `(
        ${car.carNumber ? `'${escapeSql(car.carNumber)}'` : 'NULL'},
        ${car.status ? `'${escapeSql(car.status)}'` : 'NULL'},
        ${car.ownerDocument ? `'${escapeSql(car.ownerDocument)}'` : 'NULL'},
        ${car.ownerName ? `'${escapeSql(car.ownerName)}'` : 'NULL'},
        ${car.propertyName ? `'${escapeSql(car.propertyName)}'` : 'NULL'},
        ${car.areaHa || 0},
        '${car.state}',
        ${car.municipality ? `'${escapeSql(car.municipality)}'` : 'NULL'},
        'SICAR',
        ST_GeomFromText('${car.geometry}', 4326)
      )`;
    }).join(',\n');

    const query = `
      INSERT INTO car_registrations (
        car_number,
        status,
        owner_document,
        owner_name,
        property_name,
        area_ha,
        state,
        municipality,
        source,
        geometry
      ) VALUES ${values}
      ON CONFLICT (car_number) DO UPDATE SET
        status = EXCLUDED.status,
        owner_document = EXCLUDED.owner_document,
        owner_name = EXCLUDED.owner_name,
        property_name = EXCLUDED.property_name,
        area_ha = EXCLUDED.area_ha,
        municipality = EXCLUDED.municipality,
        geometry = EXCLUDED.geometry;
    `;

    try {
      await db.execute(sql.raw(query));
      inserted += batch.length;
      logger.info('Progress', { inserted, total: cars.length });
    } catch (error) {
      logger.error('Batch insert failed', {
        batch: i / batchSize,
        error: error instanceof Error ? error.message : error
      });
      // Continue com próximo batch
    }
  }

  logger.info('✅ CAR registrations seeded successfully', { inserted });

  // Stats finais
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT status) as statuses,
      SUM(area_ha) as total_area_ha
    FROM car_registrations
  `);

  logger.info('Database stats', stats.rows[0]);

  // Stats por estado
  const statsByState = await db.execute(sql`
    SELECT
      state,
      COUNT(*) as count,
      SUM(area_ha) as area_ha
    FROM car_registrations
    GROUP BY state
    ORDER BY count DESC
  `);

  logger.info('Stats by state', statsByState.rows);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: npm run seed:car <filepath>');
    logger.error('Example: npm run seed:car data/car_mt.json');
    process.exit(1);
  }

  const filepath = args[0];

  try {
    await seedCAR(filepath);
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedCAR };
