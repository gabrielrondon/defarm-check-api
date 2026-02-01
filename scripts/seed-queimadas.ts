#!/usr/bin/env tsx
/**
 * Script para processar e inserir focos de queimadas no banco
 *
 * Processa: data/queimadas_focos.csv (INPE)
 *
 * Uso:
 *   npm run seed:queimadas
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../src/db/client.js';
import { queimadasFocos } from '../src/db/schema.js';
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

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Parse timestamp do INPE (formato: dd/MM/yyyy ou yyyy-MM-dd HH:mm:ss)
 */
function parseDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;

  try {
    // Formato: yyyy-MM-dd HH:mm:ss (se tiver espaço)
    if (dateStr.includes(' ')) {
      return new Date(dateStr);
    }

    // Formato brasileiro: dd/MM/yyyy
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      const time = timeStr || '00:00:00';
      return new Date(`${year}-${month}-${day}T${time}Z`);
    }

    // Formato ISO
    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Mapeia CSV do INPE para schema do banco
 */
function mapQueimadasRecord(record: any): any {
  // Clean whitespace from coordinates
  const lat = String(record.lat || record.latitude || record.Latitude || '').trim();
  const lon = String(record.lon || record.longitude || record.Longitude || '').trim();

  // Parse datetime (already combined in data_hora_gmt field)
  const dateTimeStr = record.data_hora_gmt || record.data_hora || record.datahora || record.DataHora;
  const dateTime = parseDateTime(dateTimeStr);

  if (!lat || !lon || !dateTime) return null;

  // Keep data from last 90 days only
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  if (dateTime < ninetyDaysAgo) return null;

  // Parse FRP if present
  let frp = null;
  const frpValue = record.frp || record.FRP;
  if (frpValue && frpValue !== '') {
    const parsed = parseFloat(frpValue);
    if (!isNaN(parsed)) {
      frp = Math.round(parsed); // Round to integer
    }
  }

  return {
    latitude: lat,
    longitude: lon,
    dateTime,
    satellite: record.satelite || record.satellite || record.Satelite || null,
    municipality: record.municipio || record.municipality || record.Municipio || null,
    state: record.estado || record.state || record.Estado || record.uf || null,
    biome: record.bioma || record.biome || record.Bioma || null,
    frp,
    riskLevel: record.risco_fogo || record.risk || null,
    source: 'INPE'
  };
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('INPE Queimadas - Seed Database');
  logger.info('='.repeat(60));

  const filePath = path.join(DATA_DIR, 'queimadas_focos.csv');

  try {
    const content = await fs.readFile(filePath, { encoding: 'latin1' }); // INPE usa latin1

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ',',
      trim: true,
      bom: true,
      relax_column_count: true
    });

    logger.info(`Parsed ${records.length} fire hotspot records`);

    const mapped = records.map(mapQueimadasRecord).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid records (last 90 days)`);

    if (mapped.length === 0) {
      logger.warn('No valid records to insert');
      return;
    }

    // Clear old data first (keep only last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    await db.execute(sql`
      DELETE FROM queimadas_focos
      WHERE date_time < ${ninetyDaysAgo.toISOString()}
    `);
    logger.info('✅ Cleaned old fire hotspots (> 90 days)');

    // Insert in batches of 100 (smaller batches to avoid query size limits)
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);

      // Insert records
      const values = batch.map(r => ({
        ...r,
        id: undefined, // Let DB generate
        createdAt: undefined // Let DB generate
      }));

      await db.insert(queimadasFocos).values(values).onConflictDoNothing();
      inserted += batch.length;

      logger.info(`Inserted ${inserted}/${mapped.length} fire hotspots`);
    }

    // Update geometries
    logger.info('Updating PostGIS geometries...');
    await db.execute(sql`
      UPDATE queimadas_focos
      SET geom = ST_SetSRID(ST_MakePoint(CAST(longitude AS double precision), CAST(latitude AS double precision)), 4326)
      WHERE geom IS NULL
    `);

    // Get statistics
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT state) as states,
        COUNT(DISTINCT biome) as biomes,
        MIN(date_time) as oldest,
        MAX(date_time) as newest
      FROM queimadas_focos
    `);

    const row: any = stats.rows[0];

    logger.info('='.repeat(60));
    logger.info('Seed Summary:');
    logger.info(`  Total fire hotspots: ${row.total}`);
    logger.info(`  States: ${row.states}`);
    logger.info(`  Biomes: ${row.biomes}`);
    logger.info(`  Date range: ${row.oldest} to ${row.newest}`);
    logger.info('='.repeat(60));
    logger.info('✅ Seed completed successfully');

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.error('File not found: queimadas_focos.csv');
      logger.error('Please run: npm run data:queimadas');
      process.exit(1);
    }
    throw error;
  }
}

main()
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$client.end();
  });
