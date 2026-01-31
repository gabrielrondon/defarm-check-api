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

  // Batch insert - very small size due to extremely large geometries (max 2.8MB)
  const BATCH_SIZE = 5;
  const MAX_GEOMETRY_SIZE_FOR_BATCH = 500000; // 500KB - geometrias maiores vão individual
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < terras.length; i += BATCH_SIZE) {
    const batch = terras.slice(i, i + BATCH_SIZE);

    // Separar registros com geometrias muito grandes
    const largeBatch = batch.filter(t => t.geometry.length > MAX_GEOMETRY_SIZE_FOR_BATCH);
    const normalBatch = batch.filter(t => t.geometry.length <= MAX_GEOMETRY_SIZE_FOR_BATCH);

    // Inserir geometrias grandes individualmente desde o início
    for (const terra of largeBatch) {
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
        logger.info('Large geometry inserted individually', {
          name: name,
          size: Math.round(terra.geometry.length / 1024) + 'KB'
        });
      } catch (err) {
        // Extract actual PostgreSQL error from drizzle error
        const errorMsg = err instanceof Error ? err.message : String(err);
        const pgError = errorMsg.split('\n').find(line =>
          line.includes('ERROR:') || line.includes('error:') || line.includes('violates')
        ) || errorMsg.slice(0, 300);

        logger.error('Large geometry insert failed', {
          name: terra.name || 'Terra Indígena',
          etnia: terra.etnia,
          state: terra.state,
          size: Math.round(terra.geometry.length / 1024) + 'KB',
          error: pgError
        });
        failed++;
      }
    }

    // Continuar com batch normal se houver
    if (normalBatch.length === 0) {
      continue;
    }

    // Build VALUES clause (following seed-unidades-conservacao.ts pattern)
    const values = normalBatch.map(terra => {
      const escapeSql = (str: string | null | undefined) =>
        str ? `'${str.replace(/'/g, "''")}'` : 'NULL';

      // Nome é obrigatório - usar valor padrão se vazio
      const name = terra.name && terra.name.trim() ? terra.name.trim() : 'Terra Indígena';

      // Escapar geometria para SQL
      const geometry = terra.geometry.replace(/'/g, "''");

      return `(
        ${escapeSql(name)},
        ${escapeSql(terra.etnia)},
        ${escapeSql(terra.phase)},
        ${terra.areaHa || 0},
        ${terra.state ? `'${terra.state}'` : 'NULL'},
        ${escapeSql(terra.municipality)},
        ${escapeSql(terra.modalidade)},
        'FUNAI',
        ST_SimplifyPreserveTopology(ST_Multi(ST_GeomFromText('${geometry}', 4326)), 0.001)
      )`;
    }).join(',\n');

    const query = `
      INSERT INTO terras_indigenas (
        name,
        etnia,
        phase,
        area_ha,
        state,
        municipality,
        modalidade,
        source,
        geometry
      ) VALUES ${values}
      ON CONFLICT DO NOTHING;
    `;

    // Error handling (following seed-car.ts pattern)
    try {
      await db.execute(sql.raw(query));
      inserted += normalBatch.length;
      logger.info('Batch inserted', {
        batch: Math.floor(i / BATCH_SIZE) + 1,
        records: normalBatch.length,
        inserted,
        total: terras.length
      });
    } catch (error) {
      logger.warn('Batch insert failed, falling back to individual inserts', {
        batch: Math.floor(i / BATCH_SIZE) + 1,
        error: error instanceof Error ? error.message : String(error).slice(0, 500)
      });

      // Fallback: insert one by one for this batch only
      for (const terra of normalBatch) {
        try {
          const name = terra.name && terra.name.trim() ? terra.name.trim() : 'Terra Indígena';

          await db.execute(sql`
            INSERT INTO terras_indigenas (
              name, etnia, phase, area_ha, state, municipality, modalidade, source, geometry
            ) VALUES (
              ${name},
              ${terra.etnia || null},
              ${terra.phase || null},
              ${terra.areaHa || 0},
              ${terra.state || null},
              ${terra.municipality || null},
              ${terra.modalidade || null},
              'FUNAI',
              ST_SimplifyPreserveTopology(ST_Multi(ST_GeomFromText(${terra.geometry}, 4326)), 0.001)
            )
            ON CONFLICT DO NOTHING
          `);
          inserted++;
        } catch (err) {
          // Extract actual PostgreSQL error from drizzle error
          const errorMsg = err instanceof Error ? err.message : String(err);
          const pgError = errorMsg.split('\n').find(line =>
            line.includes('ERROR:') || line.includes('error:') || line.includes('violates')
          ) || errorMsg.slice(0, 300);

          logger.error('Individual insert failed', {
            name: terra.name || 'Terra Indígena',
            etnia: terra.etnia,
            state: terra.state,
            geometrySize: Math.round(terra.geometry.length / 1024) + 'KB',
            error: pgError
          });
          failed++;
        }
      }
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
