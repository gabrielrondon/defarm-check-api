#!/usr/bin/env tsx
/**
 * Script para fazer seed de dados COMPLETOS do PRODES no PostgreSQL
 *
 * Processa arquivos GeoJSON baixados do TerraBrasilis (prodes_*.json)
 * e insere no banco de dados com geometrias PostGIS
 *
 * Uso:
 *   npm run seed:prodes-complete
 *   npm run seed:prodes-complete -- --file=prodes_amazonia_5y.json
 *   npm run seed:prodes-complete -- --clean  (limpa tabela antes)
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '../src/db/client.js';
import { prodesDeforestation } from '../src/db/schema.js';
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

interface ProdesFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
  properties: {
    gid?: number;
    ano?: number;
    year?: number;
    areamunkm?: number;
    areaKm2?: number;
    area_km2?: number;
    areameters?: number;
    classname?: string;
    class_name?: string;
    path_row?: string;
    pathrow?: string;
    uf?: string;
    state?: string;
    municipio?: string;
    municipality?: string;
    source?: string;
    image_date?: string;
    julday?: number;
    scene_id?: string;
    sensor?: string;
    satellite?: string;
    [key: string]: any; // Outros campos opcionais
  };
}

async function cleanTable() {
  logger.info('Cleaning prodes_deforestation table...');
  await db.execute(sql`TRUNCATE TABLE prodes_deforestation RESTART IDENTITY CASCADE`);
  logger.info('Table cleaned');
}

async function findProdesFiles(): Promise<string[]> {
  const dataDir = path.join(process.cwd(), 'data');

  try {
    const files = await fs.readdir(dataDir);
    const prodesFiles = files
      .filter(file => file.startsWith('prodes_') && file.endsWith('.json'))
      .map(file => path.join(dataDir, file));

    return prodesFiles;
  } catch (error) {
    logger.error('Failed to read data directory', { error });
    return [];
  }
}

function normalizeProperties(props: any): {
  year: number;
  areaKm2: number;
  state: string | null;
  municipality: string | null;
  className: string | null;
  pathRow: string | null;
  imageDate: string | null;
  source: string | null;
} {
  // Year - try multiple field names
  const year = props.year || props.ano || props.view_date?.substring(0, 4) || new Date().getFullYear();

  // Area - try multiple field names and convert to km2
  let areaKm2 = props.areaKm2 || props.area_km2 || props.areamunkm || 0;
  if (props.areameters && !areaKm2) {
    areaKm2 = props.areameters / 1_000_000; // m2 to km2
  }

  // State
  const state = (props.uf || props.state || '').toString().trim().toUpperCase() || null;

  // Municipality
  const municipality = (props.municipio || props.municipality || '').toString().trim() || null;

  // Class name
  const className = (props.classname || props.class_name || 'DESMATAMENTO').toString().trim() || null;

  // Path/Row
  const pathRow = (props.path_row || props.pathrow || '').toString().trim() || null;

  // Image date
  const imageDate = props.image_date || props.view_date || null;

  // Source
  const source = props.source || 'PRODES/INPE';

  return {
    year: parseInt(year.toString()),
    areaKm2: parseFloat(areaKm2.toString()),
    state,
    municipality,
    className,
    pathRow,
    imageDate,
    source
  };
}

async function seedFile(filepath: string, batchSize: number = 50): Promise<number> {
  const filename = path.basename(filepath);
  logger.info(`Reading ${filename}...`);

  console.log(`📖 Reading file: ${filename}...`);
  const content = await fs.readFile(filepath, 'utf-8');
  console.log(`✅ File read: ${Math.round(content.length / 1024 / 1024)} MB`);

  console.log(`🔍 Parsing JSON...`);
  const geojson = JSON.parse(content);
  console.log(`✅ JSON parsed`);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: missing features array');
  }

  console.log(`✅ Features array found: ${geojson.features.length} features`);

  const features = geojson.features as ProdesFeature[];
  logger.info(`Processing ${features.length} features from ${filename}`);
  console.log(`\n📊 Total features to process: ${features.length}`);
  console.log(`📦 Batch size: ${batchSize}`);

  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches to avoid memory issues
  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(features.length / batchSize);

    logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} features)`);
    console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} features)`);

    // Prepare batch data
    const batchData: Array<{
      normalized: ReturnType<typeof normalizeProperties>;
      geomJson: string;
    }> = [];

    for (const feature of batch) {
      try {
        const normalized = normalizeProperties(feature.properties);
        const geomJson = JSON.stringify(feature.geometry);
        batchData.push({ normalized, geomJson });
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Feature normalization failed:`, errorMsg);
        if (errors.length < 10) {
          errors.push(errorMsg);
        }
      }
    }

    console.log(`✅ Prepared ${batchData.length} features for INSERT (${failed} failed normalization)`);

    // Build bulk INSERT query with all rows in batch
    if (batchData.length > 0) {
      try {
        // Build VALUES clause dynamically
        const valuesClauses: any[] = [];

        for (const item of batchData) {
          const { normalized, geomJson } = item;
          // Convert km² to hectares (1 km² = 100 ha)
          const areaHa = Math.round(normalized.areaKm2 * 100);
          valuesClauses.push(sql`(
            ${normalized.year},
            ${areaHa},
            ${normalized.state},
            ${normalized.municipality},
            ${normalized.pathRow},
            ${normalized.source},
            ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)
          )`);
        }

        // Execute single bulk INSERT for entire batch
        console.log(`Executing INSERT for ${batchData.length} records...`);
        await db.execute(sql`
          INSERT INTO prodes_deforestation (
            year, area_ha, state, municipality, path_row, source, geometry
          ) VALUES ${sql.join(valuesClauses, sql`, `)}
        `);
        console.log(`✅ INSERT successful for ${batchData.length} records`);

        inserted += batchData.length;

      } catch (error) {
        failed += batchData.length;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('\n❌ BATCH INSERT FAILED:');
        console.error('Error message:', errorMsg);
        console.error('Error stack:', errorStack);
        console.error('Batch size:', batchData.length);
        console.error('Error object:', error);

        logger.error('Batch insert failed', {
          error: errorMsg,
          stack: errorStack,
          batchSize: batchData.length,
          fullError: error
        });

        if (errors.length < 10) {
          errors.push(errorMsg);
        }
      }
    }

    // Log progress
    const progress = Math.round((i + batch.length) / features.length * 100);
    logger.info(`Progress: ${progress}% (${inserted} inserted, ${failed} failed)`);
  }

  if (errors.length > 0) {
    logger.warn('Sample errors:', { count: failed, samples: errors });
  }

  return inserted;
}

async function seedAll(fileFilter?: string, clean: boolean = false) {
  const startTime = Date.now();

  logger.info('Starting PRODES complete seed', {
    fileFilter: fileFilter || 'ALL FILES',
    cleanFirst: clean
  });

  if (clean) {
    await cleanTable();
  }

  // Find files
  let files: string[];
  if (fileFilter) {
    const filepath = path.join(process.cwd(), 'data', fileFilter);
    files = [filepath];
  } else {
    files = await findProdesFiles();
  }

  if (files.length === 0) {
    logger.warn('No PRODES files found in data/ directory');
    logger.warn('Run "npm run data:prodes-complete" first to download data');
    return;
  }

  logger.info(`Found ${files.length} PRODES files to seed`);

  const results = {
    success: [] as { file: string; records: number }[],
    failed: [] as { file: string; error: string }[],
    totalRecords: 0
  };

  for (const filepath of files) {
    const filename = path.basename(filepath);

    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Processing: ${filename} (${files.indexOf(filepath) + 1}/${files.length})`);
      logger.info('='.repeat(60));

      const recordCount = await seedFile(filepath);

      results.success.push({
        file: filename,
        records: recordCount
      });
      results.totalRecords += recordCount;

    } catch (error) {
      logger.error(`Failed to seed ${filename}`, {
        error: error instanceof Error ? error.message : error
      });
      results.failed.push({
        file: filename,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  logger.info('\n' + '='.repeat(60));
  logger.info('SEED SUMMARY');
  logger.info('='.repeat(60));
  logger.info('Success:', {
    files: results.success.length,
    totalRecords: results.totalRecords,
    list: results.success.map(r => `${r.file} (${r.records.toLocaleString()} records)`).join(', ')
  });

  if (results.failed.length > 0) {
    logger.error('Failed:', {
      files: results.failed.length,
      list: results.failed.map(f => `${f.file}: ${f.error}`).join('\n')
    });
  }

  logger.info('Execution time:', {
    totalSeconds: totalTime,
    minutes: Math.round(totalTime / 60)
  });

  logger.info('='.repeat(60));

  return results;
}

async function main() {
  const args = process.argv.slice(2);

  const fileArg = args.find(arg => arg.startsWith('--file='));
  const clean = args.includes('--clean');

  const file = fileArg?.split('=')[1];

  try {
    const results = await seedAll(file, clean);

    if (results && results.failed.length > 0) {
      logger.warn(`⚠️  Completed with ${results.failed.length} failures`);
      process.exit(1);
    } else {
      logger.info('✅ All PRODES files seeded successfully');
      process.exit(0);
    }
  } catch (error) {
    logger.error('❌ Seed failed', { error });
    process.exit(1);
  }
}

// Run if this is the main module (ES modules)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { seedAll };
