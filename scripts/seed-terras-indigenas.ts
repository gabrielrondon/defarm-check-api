#!/usr/bin/env tsx
/**
 * Script para fazer seed de Terras Indígenas no PostgreSQL + PostGIS
 *
 * Uso:
 *   npm run seed:terras-indigenas data/terras_indigenas.json
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

interface TerraIndigena {
  name: string;
  etnia: string;
  phase: string;
  areaHa: number;
  state: string;
  municipality: string;
  modalidade: string;
  geometry: string;  // WKT format
}

async function seedTerrasIndigenas(filepath: string) {
  logger.info('Seeding Terras Indígenas to database', { filepath });

  // Ler arquivo JSON
  const content = await fs.readFile(filepath, 'utf-8');
  const terras: TerraIndigena[] = JSON.parse(content);

  logger.info('Terras Indígenas loaded from file', { count: terras.length });

  if (terras.length === 0) {
    logger.warn('No Terras Indígenas to seed');
    return;
  }

  // Limpar tabela antes
  logger.info('Clearing existing Terras Indígenas');
  await db.execute(sql`TRUNCATE TABLE terras_indigenas CASCADE`);

  // Insert all individually (geometries are too large for batch inserts, causing timeouts)
  let inserted = 0;
  let failed = 0;
  const total = terras.length;

  logger.info('Inserting Terras Indígenas individually (large geometries)', { total });

  for (let i = 0; i < total; i++) {
    const terra = terras[i];

    try {
      const name = terra.name && terra.name.trim() ? terra.name.trim() : 'Terra Indígena';
      // Pegar só o primeiro estado se houver múltiplos (schema permite apenas 2 chars)
      const state = terra.state ? terra.state.split(',')[0].trim() : null;

      await db.execute(sql`
        INSERT INTO terras_indigenas (
          name, etnia, phase, area_ha, state, municipality, modalidade, source, geometry
        ) VALUES (
          ${name},
          ${terra.etnia || null},
          ${terra.phase || null},
          ${terra.areaHa || 0},
          ${state},
          ${terra.municipality || null},
          ${terra.modalidade || null},
          'FUNAI',
          ST_SimplifyPreserveTopology(ST_Multi(ST_GeomFromText(${terra.geometry}, 4326)), 0.001)
        )
        ON CONFLICT DO NOTHING
      `);
      inserted++;

      // Log progress every 10 records
      if ((i + 1) % 10 === 0 || (i + 1) === total) {
        logger.info('Progress', {
          inserted,
          failed,
          total,
          progress: `${Math.round(((i + 1) / total) * 100)}%`
        });
      }
    } catch (err) {
      // Extract actual PostgreSQL error from drizzle error
      const errorMsg = err instanceof Error ? err.message : String(err);
      const pgError = errorMsg.split('\n').find(line =>
        line.includes('ERROR:') || line.includes('error:') || line.includes('violates')
      ) || errorMsg.slice(0, 300);

      logger.error('Insert failed', {
        name: terra.name || 'Terra Indígena',
        etnia: terra.etnia,
        state: terra.state,
        geometrySize: Math.round(terra.geometry.length / 1024) + 'KB',
        error: pgError
      });
      failed++;
    }
  }

  logger.info('✅ Terras Indígenas seeded successfully', {
    inserted,
    failed,
    total: terras.length
  });

  // Stats finais
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT phase) as phases,
      SUM(area_ha) as total_area_ha
    FROM terras_indigenas
  `);

  logger.info('Database stats', stats.rows[0]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: npm run seed:terras-indigenas <filepath>');
    logger.error('Example: npm run seed:terras-indigenas data/terras_indigenas.json');
    process.exit(1);
  }

  const filepath = args[0];

  try {
    await seedTerrasIndigenas(filepath);
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error });
    process.exit(1);
  }
}

main();

export { seedTerrasIndigenas };
