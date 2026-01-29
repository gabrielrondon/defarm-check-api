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

  // Batch insert
  let inserted = 0;
  const batchSize = 50;  // Geometrias podem ser grandes

  for (let i = 0; i < terras.length; i += batchSize) {
    const batch = terras.slice(i, i + batchSize);

    const values = batch.map(terra => {
      return `(
        ${terra.name ? `'${terra.name.replace(/'/g, "''")}'` : 'NULL'},
        ${terra.etnia ? `'${terra.etnia.replace(/'/g, "''")}'` : 'NULL'},
        ${terra.phase ? `'${terra.phase.replace(/'/g, "''")}'` : 'NULL'},
        ${terra.areaHa || 0},
        ${terra.state ? `'${terra.state}'` : 'NULL'},
        ${terra.municipality ? `'${terra.municipality.replace(/'/g, "''")}'` : 'NULL'},
        ${terra.modalidade ? `'${terra.modalidade.replace(/'/g, "''")}'` : 'NULL'},
        'FUNAI',
        ST_GeomFromText('${terra.geometry}', 4326)
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
      ) VALUES ${values};
    `;

    await db.execute(sql.raw(query));

    inserted += batch.length;
    logger.info('Progress', { inserted, total: terras.length });
  }

  logger.info('✅ Terras Indígenas seeded successfully', { inserted });

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

if (require.main === module) {
  main();
}

export { seedTerrasIndigenas };
