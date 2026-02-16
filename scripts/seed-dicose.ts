#!/usr/bin/env tsx
/**
 * Script para fazer seed de dados DICOSE (Uruguay) no PostgreSQL
 *
 * Uso:
 *   npm run seed:dicose -- --year=2024
 *   npm run seed:dicose -- --year=2024 --clean
 *   npm run seed:dicose -- --year=2024 --limit=1000
 *
 * Requer CSVs previamente baixados em: data/uruguay/dicose/<year>/
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../src/db/client.js';
import { dicoseRegistrations } from '../src/db/schema.js';
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

const DATA_DIR = path.join(process.cwd(), 'data', 'uruguay', 'dicose');

interface DICOSERecord {
  establishmentId: string;
  producerDocument?: string;
  producerName?: string;
  year: number;
  areaHa?: number;
  department: string;
  section?: string;
  activity?: string;
  livestockCount?: any;
  landUse?: any;
}

interface SeedOptions {
  year: number;
  clean?: boolean;
  limit?: number;
}

/**
 * Parse CSV e extrai registros DICOSE
 */
async function parseDICOSEFiles(year: number): Promise<DICOSERecord[]> {
  const yearDir = path.join(DATA_DIR, year.toString());
  logger.info(`Parsing DICOSE CSV files from ${yearDir}`);

  // Verificar se diretório existe
  try {
    await fs.access(yearDir);
  } catch {
    throw new Error(`Directory not found: ${yearDir}. Run: npm run data:dicose -- --year=${year}`);
  }

  // Ler arquivo principal: DatosGenerales
  const generalFile = path.join(yearDir, 'DatosGenerales.csv');

  try {
    await fs.access(generalFile);
  } catch {
    throw new Error(`DatosGenerales.csv not found. Please download DICOSE files first.`);
  }

  logger.info('Parsing DatosGenerales.csv...');
  const generalContent = await fs.readFile(generalFile, 'utf-8');
  const generalRecords = parse(generalContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ',',
    bom: true
  });

  logger.info(`Parsed ${generalRecords.length} establishments from DatosGenerales`);

  // Mapear para formato do banco
  const records: DICOSERecord[] = generalRecords.map((row: any) => {
    // Normalizar nomes de colunas (podem variar)
    const estId = row.ID_ESTABLECIMIENTO || row.id_establecimiento || row.IdEstablecimiento;
    const ruc = row.RUT_PRODUCTOR || row.rut_productor || row.RUC || row.ruc;
    const name = row.NOMBRE_PRODUCTOR || row.nombre_productor || row.NombreProductor;
    const dept = row.DEPARTAMENTO || row.departamento || row.Departamento;
    const sect = row.SECCION || row.seccion || row.Seccion;
    const area = row.AREA_HA || row.area_ha || row.AreaHa || row.SUPERFICIE_TOTAL;

    return {
      establishmentId: estId?.toString() || 'UNKNOWN',
      producerDocument: ruc ? ruc.toString().replace(/\D/g, '') : undefined,
      producerName: name?.toString(),
      year,
      areaHa: area ? parseInt(area) : undefined,
      department: dept?.toString() || 'UNKNOWN',
      section: sect?.toString(),
      activity: row.ACTIVIDAD || row.actividad || 'UNKNOWN'
    };
  });

  // Tentar enriquecer com dados de animais se disponível
  const animalsFile = path.join(yearDir, 'DatosAnimales.csv');
  try {
    await fs.access(animalsFile);
    logger.info('Enriching with DatosAnimales.csv...');
    const animalsContent = await fs.readFile(animalsFile, 'utf-8');
    const animalsRecords = parse(animalsContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ',',
      bom: true
    });

    // Agregar contagens por estabelecimento
    const animalsByEst = new Map<string, any>();
    for (const row of animalsRecords) {
      const estId = (row.ID_ESTABLECIMIENTO || row.id_establecimiento)?.toString();
      if (!estId) continue;

      if (!animalsByEst.has(estId)) {
        animalsByEst.set(estId, { bovinos: 0, ovinos: 0, equinos: 0, porcinos: 0, caprinos: 0 });
      }

      const counts = animalsByEst.get(estId);
      const species = (row.ESPECIE || row.especie || '').toLowerCase();
      const count = parseInt(row.CANTIDAD || row.cantidad || '0');

      if (species.includes('bovin')) counts.bovinos += count;
      else if (species.includes('ovin')) counts.ovinos += count;
      else if (species.includes('equin')) counts.equinos += count;
      else if (species.includes('porcin')) counts.porcinos += count;
      else if (species.includes('caprin')) counts.caprinos += count;
    }

    // Adicionar aos registros
    for (const record of records) {
      const livestock = animalsByEst.get(record.establishmentId);
      if (livestock) {
        record.livestockCount = livestock;
      }
    }

    logger.info(`Enriched ${animalsByEst.size} establishments with livestock data`);
  } catch {
    logger.warn('DatosAnimales.csv not found - skipping livestock enrichment');
  }

  return records;
}

/**
 * Seed registros no banco
 */
async function seedDICOSE(options: SeedOptions): Promise<void> {
  const { year, clean = false, limit } = options;

  logger.info('Seeding DICOSE registrations', { year, clean, limit });

  // Parse CSVs
  let records = await parseDICOSEFiles(year);

  if (limit && limit > 0) {
    logger.info(`Limiting to first ${limit} records`);
    records = records.slice(0, limit);
  }

  logger.info(`Total records to seed: ${records.length}`);

  // Limpar ano específico se --clean
  if (clean) {
    logger.info(`Clearing existing DICOSE records for year ${year}`);
    await db.execute(sql`DELETE FROM dicose_registrations WHERE year = ${year}`);
  }

  // Contar existentes
  const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM dicose_registrations WHERE year = ${year}`);
  const existingCount = parseInt(countResult.rows[0].count);
  logger.info(`Existing DICOSE records for ${year}: ${existingCount}`);

  // Inserir em batches
  const batchSize = 100;
  let inserted = 0;
  let failed = 0;

  logger.info('Inserting DICOSE registrations...');

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    try {
      await db.insert(dicoseRegistrations).values(
        batch.map(r => ({
          establishmentId: r.establishmentId,
          producerDocument: r.producerDocument,
          producerName: r.producerName,
          year: r.year,
          areaHa: r.areaHa,
          department: r.department,
          section: r.section,
          activity: r.activity,
          livestockCount: r.livestockCount || null,
          landUse: r.landUse || null,
          country: 'UY',
          source: 'DICOSE'
        }))
      ).onConflictDoNothing();

      inserted += batch.length;

      // Log progress
      if ((i + batchSize) % 500 === 0 || (i + batchSize) >= records.length) {
        logger.info('Progress', {
          inserted,
          failed,
          total: records.length,
          progress: `${Math.round((inserted / records.length) * 100)}%`
        });
      }
    } catch (err) {
      failed += batch.length;
      logger.error('Batch insert failed', {
        batchStart: i,
        batchSize: batch.length,
        error: (err as Error).message.split('\n')[0]
      });
    }
  }

  // Contar final
  const finalCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM dicose_registrations WHERE year = ${year}`);
  const finalCount = parseInt(finalCountResult.rows[0].count);

  logger.info('Seeding completed', {
    inserted,
    failed,
    total: records.length,
    finalCount,
    successRate: `${Math.round((inserted / records.length) * 100)}%`
  });

  logger.info('✓ DICOSE data ready for checks!');
}

// Parse args
const args = process.argv.slice(2);
const yearArg = args.find(a => a.startsWith('--year='));
const clean = args.includes('--clean');
const limitArg = args.find(a => a.startsWith('--limit='));

const year = yearArg ? parseInt(yearArg.split('=')[1]) : 2024;
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

// Executar
seedDICOSE({ year, clean, limit }).catch((err) => {
  logger.error('Failed to seed DICOSE data', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});
