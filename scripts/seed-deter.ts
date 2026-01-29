#!/usr/bin/env tsx
/**
 * Script para fazer seed de alertas DETER no PostgreSQL + PostGIS
 *
 * Uso:
 *   npm run seed:deter data/deter_alerts_2026-01-28.json
 */

import fs from 'fs/promises';
import path from 'path';
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

interface DeterAlert {
  alertDate: string;
  areaHa: number;
  state: string;
  municipality: string;
  classname: string;
  sensor: string;
  pathRow: string;
  geometry: string;  // WKT format
}

async function seedDeterAlerts(filepath: string) {
  logger.info('Seeding DETER alerts to database', { filepath });

  // Ler arquivo JSON
  const content = await fs.readFile(filepath, 'utf-8');
  const alerts: DeterAlert[] = JSON.parse(content);

  logger.info('DETER alerts loaded from file', { count: alerts.length });

  if (alerts.length === 0) {
    logger.warn('No alerts to seed');
    return;
  }

  // Batch insert com SQL direto (incluindo geometria)
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < alerts.length; i += batchSize) {
    const batch = alerts.slice(i, i + batchSize);

    // Construir VALUES para batch insert
    const values = batch.map(alert => {
      return `(
        '${alert.alertDate}',
        ${alert.areaHa},
        ${alert.state ? `'${alert.state}'` : 'NULL'},
        ${alert.municipality ? `'${alert.municipality.replace(/'/g, "''")}'` : 'NULL'},
        ${alert.classname ? `'${alert.classname}'` : 'NULL'},
        ${alert.sensor ? `'${alert.sensor}'` : 'NULL'},
        ${alert.pathRow ? `'${alert.pathRow}'` : 'NULL'},
        'DETER-B',
        ST_GeomFromText('${alert.geometry}', 4326)
      )`;
    }).join(',\n');

    const query = `
      INSERT INTO deter_alerts (
        alert_date,
        area_ha,
        state,
        municipality,
        classname,
        sensor,
        path_row,
        source,
        geometry
      ) VALUES ${values}
      ON CONFLICT DO NOTHING;
    `;

    await db.execute(sql.raw(query));

    inserted += batch.length;
    logger.info('Progress', { inserted, total: alerts.length });
  }

  logger.info('✅ DETER alerts seeded successfully', { inserted });

  // Stats finais
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT classname) as classes,
      SUM(area_ha) as total_area_ha,
      MIN(alert_date) as first_alert,
      MAX(alert_date) as last_alert
    FROM deter_alerts
  `);

  logger.info('Database stats', stats.rows[0]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: npm run seed:deter <filepath>');
    logger.error('Example: npm run seed:deter data/deter_alerts_2026-01-28.json');
    process.exit(1);
  }

  const filepath = args[0];

  try {
    await seedDeterAlerts(filepath);
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedDeterAlerts };
