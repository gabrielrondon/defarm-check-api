#!/usr/bin/env tsx
/**
 * Script para fazer seed de Unidades de Conservação no PostgreSQL + PostGIS
 *
 * Uso:
 *   npm run seed:unidades-conservacao data/unidades_conservacao.json
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

interface UnidadeConservacao {
  name: string;
  category: string;
  group: string;
  areaHa: number;
  state: string;
  municipality: string;
  sphere: string;
  geometry: string;  // WKT format
}

async function seedUnidadesConservacao(filepath: string) {
  logger.info('Seeding Unidades de Conservação to database', { filepath });

  // Ler arquivo JSON
  const content = await fs.readFile(filepath, 'utf-8');
  const ucs: UnidadeConservacao[] = JSON.parse(content);

  logger.info('Unidades de Conservação loaded from file', { count: ucs.length });

  if (ucs.length === 0) {
    logger.warn('No Unidades de Conservação to seed');
    return;
  }

  // Limpar tabela antes
  logger.info('Clearing existing Unidades de Conservação');
  await db.execute(sql`TRUNCATE TABLE unidades_conservacao CASCADE`);

  // Batch insert
  let inserted = 0;
  const batchSize = 50;  // Geometrias podem ser grandes

  for (let i = 0; i < ucs.length; i += batchSize) {
    const batch = ucs.slice(i, i + batchSize);

    const values = batch.map(uc => {
      return `(
        ${uc.name ? `'${uc.name.replace(/'/g, "''")}'` : 'NULL'},
        ${uc.category ? `'${uc.category.replace(/'/g, "''")}'` : 'NULL'},
        ${uc.group ? `'${uc.group.replace(/'/g, "''")}'` : 'NULL'},
        ${uc.areaHa || 0},
        ${uc.state ? `'${uc.state}'` : 'NULL'},
        ${uc.municipality ? `'${uc.municipality.replace(/'/g, "''")}'` : 'NULL'},
        ${uc.sphere ? `'${uc.sphere.replace(/'/g, "''")}'` : 'NULL'},
        'ICMBio',
        ST_GeomFromText('${uc.geometry}', 4326)
      )`;
    }).join(',\n');

    const query = `
      INSERT INTO unidades_conservacao (
        name,
        category,
        "group",
        area_ha,
        state,
        municipality,
        sphere,
        source,
        geometry
      ) VALUES ${values};
    `;

    await db.execute(sql.raw(query));

    inserted += batch.length;
    logger.info('Progress', { inserted, total: ucs.length });
  }

  logger.info('✅ Unidades de Conservação seeded successfully', { inserted });

  // Stats finais
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT "group") as groups,
      COUNT(DISTINCT category) as categories,
      SUM(area_ha) as total_area_ha
    FROM unidades_conservacao
  `);

  logger.info('Database stats', stats.rows[0]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: npm run seed:unidades-conservacao <filepath>');
    logger.error('Example: npm run seed:unidades-conservacao data/unidades_conservacao.json');
    process.exit(1);
  }

  const filepath = args[0];

  try {
    await seedUnidadesConservacao(filepath);
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedUnidadesConservacao };
