#!/usr/bin/env tsx
/**
 * Script para processar e inserir outorgas ANA no banco
 *
 * Processa: data/ana_outorgas.csv
 *
 * Uso:
 *   npm run seed:ana-outorgas
 */

import fs from 'fs';
import { parse } from 'csv-parse';
import { db } from '../src/db/client.js';
import { anaOutorgas } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      return `[${ts}] ${level}: ${message}`;
    })
  ),
  transports: [new transports.Console()]
});

const DATA_FILE = 'data/ana_outorgas.csv';

interface OutorgaRow {
  X: string;
  Y: string;
  INT_CD: string;
  NUMERO_PROCESSO: string;
  CODIGO_CNARH: string;
  NOME_DO_REQUERENTE: string;
  MUNICIPIO: string;
  UF: string;
  CORPO_HIDRICO: string;
  REGIAO_HIDROGRAFICA: string;
  FINALIDADE_PRINCIPAL: string;
  TIPO_INTERFERENCIA: string;
  RESOLUCAO: string;
  DATA_DE_PUBLICACAO: string;
  DATA_DE_VENCIMENTO: string;
  CATEGORIA: string;
  VOLUME_ANUAL_M3: string;
  LATITUDE: string;
  LONGITUDE: string;
}

/**
 * Parse date in DD/MM/YYYY format to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Map CSV row to database schema
 */
function mapRow(row: OutorgaRow): any {
  const latitude = parseFloat(row.LATITUDE || row.Y);
  const longitude = parseFloat(row.LONGITUDE || row.X);

  // Skip if no valid coordinates
  if (isNaN(latitude) || isNaN(longitude)) {
    return null;
  }

  return {
    intCd: row.INT_CD?.trim() || null,
    numeroProcesso: row.NUMERO_PROCESSO?.trim() || null,
    codigoCnarh: row.CODIGO_CNARH?.trim() || null,
    nomeRequerente: row.NOME_DO_REQUERENTE?.trim().substring(0, 500) || null,
    municipio: row.MUNICIPIO?.trim().substring(0, 255) || null,
    uf: row.UF?.trim().substring(0, 2) || null,
    corpoHidrico: row.CORPO_HIDRICO?.trim().substring(0, 255) || null,
    regiaoHidrografica: row.REGIAO_HIDROGRAFICA?.trim().substring(0, 255) || null,
    finalidadePrincipal: row.FINALIDADE_PRINCIPAL?.trim().substring(0, 100) || null,
    tipoInterferencia: row.TIPO_INTERFERENCIA?.trim().substring(0, 100) || null,
    resolucao: row.RESOLUCAO?.trim().substring(0, 100) || null,
    dataPublicacao: parseDate(row.DATA_DE_PUBLICACAO),
    dataVencimento: parseDate(row.DATA_DE_VENCIMENTO),
    categoria: row.CATEGORIA?.trim().substring(0, 50) || null,
    volumeAnualM3: parseInt(row.VOLUME_ANUAL_M3) || null,
    latitude,
    longitude
  };
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('ANA Outorgas - Seed Database');
  logger.info('='.repeat(60));

  // Check if file exists
  try {
    await fs.promises.access(DATA_FILE);
  } catch {
    logger.error(`File not found: ${DATA_FILE}`);
    logger.error('Please run: npm run data:ana-outorgas');
    process.exit(1);
  }

  const startTime = Date.now();
  const records: any[] = [];

  // Parse CSV
  const parser = fs.createReadStream(DATA_FILE).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true // Handle UTF-8 BOM
    })
  );

  for await (const row of parser) {
    const mapped = mapRow(row as OutorgaRow);
    if (mapped) {
      records.push(mapped);
    }

    if (records.length % 10000 === 0) {
      logger.info(`Parsed ${records.length} records...`);
    }
  }

  logger.info(`Parsed ${records.length} total outorgas`);

  // Clear old data
  await db.execute(sql`TRUNCATE TABLE ana_outorgas`);
  logger.info('✅ Cleared old ANA outorgas data');

  // Insert in batches
  const batchSize = 500;
  let inserted = 0;
  let geometriesUpdated = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    // Separate geometry from other fields
    const recordsWithoutGeom = batch.map(({ latitude, longitude, ...rest }) => ({
      ...rest,
      latitude,
      longitude
    }));

    // Insert records
    const insertedRecords = await db.insert(anaOutorgas)
      .values(recordsWithoutGeom)
      .returning({ id: anaOutorgas.id });

    inserted += insertedRecords.length;

    // Update geometries
    for (let j = 0; j < batch.length; j++) {
      const record = batch[j];
      const insertedRecord = insertedRecords[j];

      if (record.latitude && record.longitude && insertedRecord) {
        try {
          await db.execute(sql`
            UPDATE ana_outorgas
            SET geom = ST_SetSRID(ST_MakePoint(${record.longitude}, ${record.latitude}), 4326)
            WHERE id = ${insertedRecord.id}
          `);
          geometriesUpdated++;
        } catch (err: any) {
          logger.warn(`Failed to update geometry for record ${insertedRecord.id}: ${err.message}`);
        }
      }
    }

    logger.info(`Inserted ${inserted}/${records.length} outorgas (${geometriesUpdated} geometries)`);
  }

  // Get statistics
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT uf) as states,
      COUNT(DISTINCT finalidade_principal) as finalidades,
      COUNT(DISTINCT categoria) as categorias,
      COUNT(CASE WHEN data_vencimento > CURRENT_DATE THEN 1 END) as validas,
      COUNT(CASE WHEN data_vencimento <= CURRENT_DATE THEN 1 END) as vencidas,
      SUM(volume_anual_m3) as volume_total_m3
    FROM ana_outorgas
  `);

  const row: any = stats.rows[0];

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  logger.info('='.repeat(60));
  logger.info('Seed Summary:');
  logger.info(`  Total outorgas: ${row.total}`);
  logger.info(`  States: ${row.states}`);
  logger.info(`  Categories: ${row.categorias}`);
  logger.info(`  Purposes: ${row.finalidades}`);
  logger.info(`  Valid (not expired): ${row.validas}`);
  logger.info(`  Expired: ${row.vencidas}`);
  logger.info(`  Total volume: ${Number(row.volume_total_m3).toLocaleString()} m³/year`);
  logger.info(`  Geometries updated: ${geometriesUpdated}`);
  logger.info(`  Duration: ${duration}s`);
  logger.info('='.repeat(60));
  logger.info('✅ Seed completed successfully');
}

main()
  .catch(error => {
    logger.error('Fatal error:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.$client.end();
  });
