#!/usr/bin/env tsx
/**
 * Seed CAR registrations - OPTIMIZED for large files (12 GB total)
 *
 * Uses streaming + batch INSERT like PRODES to handle massive GeoJSON files
 * without loading entire file into memory.
 *
 * Usage:
 *   npm run seed:car-v2
 *   npm run seed:car-v2 -- --state=BA
 *   npm run seed:car-v2 -- --clean
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

interface CARFeature {
  type: 'Feature';
  properties: {
    cod_imovel: string;  // CAR number
    num_area: number;    // Area in hectares
    ind_status: string;  // Status (PE, AT, CA, SU)
    municipio: string;   // Municipality
    cod_estado: string;  // State code (AC, AM, etc)
    des_condic?: string; // Condition description
    dat_criaca?: string; // Creation date
    dat_atuali?: string; // Update date
  };
  geometry: any;  // GeoJSON geometry
}

async function cleanTable() {
  logger.info('Cleaning car_registrations table...');
  await db.execute(sql`TRUNCATE TABLE car_registrations CASCADE`);
  logger.info('Table cleaned');
}

async function seedFile(filepath: string, batchSize: number = 50): Promise<number> {
  const filename = path.basename(filepath);
  logger.info(`Reading ${filename}...`);

  const content = await fs.readFile(filepath, 'utf-8');
  const geojson = JSON.parse(content);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: missing features array');
  }

  const features = geojson.features as CARFeature[];
  logger.info(`Processing ${features.length} features from ${filename}`);

  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(features.length / batchSize);

    logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} features)`);

    // Prepare batch data
    const batchData: Array<{
      carNumber: string;
      status: string;
      areaHa: number;
      state: string;
      municipality: string;
      geomJson: string;
    }> = [];

    for (const feature of batch) {
      try {
        const props = feature.properties;
        const geomJson = JSON.stringify(feature.geometry);

        batchData.push({
          carNumber: props.cod_imovel,
          status: props.ind_status || 'UNKNOWN',
          areaHa: Math.round(props.num_area || 0),
          state: props.cod_estado,
          municipality: props.municipio || '',
          geomJson
        });
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errors.length < 10) {
          errors.push(errorMsg);
        }
      }
    }

    // Build bulk INSERT query
    if (batchData.length > 0) {
      try {
        const valuesClauses: any[] = [];

        for (const item of batchData) {
          valuesClauses.push(sql`(
            ${item.carNumber},
            ${item.status},
            ${item.areaHa},
            ${item.state},
            ${item.municipality},
            'SICAR',
            ST_SetSRID(ST_GeomFromGeoJSON(${item.geomJson}), 4326)
          )`);
        }

        // Execute single bulk INSERT for entire batch
        await db.execute(sql`
          INSERT INTO car_registrations (
            car_number, status, area_ha, state, municipality, source, geometry
          ) VALUES ${sql.join(valuesClauses, sql`, `)}
          ON CONFLICT (car_number) DO UPDATE SET
            status = EXCLUDED.status,
            area_ha = EXCLUDED.area_ha,
            municipality = EXCLUDED.municipality,
            geometry = EXCLUDED.geometry
        `);

        inserted += batchData.length;

      } catch (error) {
        failed += batchData.length;
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Batch insert failed', { error: errorMsg, batchSize: batchData.length });
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

async function seedAll(stateFilter?: string, clean: boolean = false) {
  const startTime = Date.now();

  logger.info('Starting CAR seed', {
    stateFilter: stateFilter || 'ALL STATES',
    cleanFirst: clean
  });

  if (clean) {
    await cleanTable();
  }

  // Find all car_*.json files
  const dataDir = path.join(process.cwd(), 'data');
  const allFiles = await fs.readdir(dataDir);
  let files = allFiles
    .filter(f => f.startsWith('car_') && f.endsWith('.json'))
    .map(f => path.join(dataDir, f));

  // Filter by state if specified
  if (stateFilter) {
    files = files.filter(f => f.includes(`car_${stateFilter.toLowerCase()}.json`));
  }

  if (files.length === 0) {
    logger.warn('No CAR files found');
    logger.warn('Run "npm run process:car" first to convert shapefiles');
    return;
  }

  logger.info(`Found ${files.length} CAR files to seed`);

  const results = {
    success: [] as { file: string; records: number }[],
    failed: [] as { file: string; error: string }[],
    totalRecords: 0
  };

  for (const filepath of files) {
    const filename = path.basename(filepath);
    const state = filename.replace('car_', '').replace('.json', '').toUpperCase();

    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Processing: ${state} (${files.indexOf(filepath) + 1}/${files.length})`);
      logger.info('='.repeat(60));

      const recordCount = await seedFile(filepath);

      results.success.push({
        file: `${state} (${recordCount.toLocaleString()} records)`,
        records: recordCount
      });
      results.totalRecords += recordCount;

    } catch (error) {
      logger.error(`Failed to seed ${state}`, {
        error: error instanceof Error ? error.message : error
      });
      results.failed.push({
        file: state,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  // Summary
  logger.info('\n' + '='.repeat(60));
  logger.info('SEED SUMMARY');
  logger.info('='.repeat(60));

  if (results.success.length > 0) {
    logger.info('Success:', {
      states: results.success.length,
      totalRecords: results.totalRecords.toLocaleString(),
      list: results.success.map(s => s.file).join(', ')
    });
  }

  if (results.failed.length > 0) {
    logger.error('Failed:', {
      states: results.failed.length,
      list: results.failed.map(f => f.file).join(', ')
    });
  }

  logger.info('Execution time:', {
    totalSeconds: totalTime,
    minutes: Math.floor(totalTime / 60)
  });

  logger.info('='.repeat(60));

  if (results.success.length === files.length) {
    logger.info('✅ All CAR files seeded successfully');
  } else {
    logger.warn('⚠️  Completed with failures');
  }
}

// Parse command line args
const args = process.argv.slice(2);
const stateFilter = args.find(arg => arg.startsWith('--state='))?.split('=')[1];
const clean = args.includes('--clean');

seedAll(stateFilter, clean).catch(error => {
  logger.error('Fatal error', { error: error.message });
  process.exit(1);
});

export { seedFile };
