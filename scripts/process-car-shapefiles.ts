#!/usr/bin/env tsx
/**
 * Process CAR shapefiles: Extract ZIPs and convert to GeoJSON
 *
 * Expects CAR ZIP files in car/ directory with format: {STATE}_AREA_IMOVEL.zip
 * Outputs GeoJSON files to data/car_{state}.json
 *
 * Usage:
 *   npm run process:car
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createLogger, format, transports } from 'winston';

const execAsync = promisify(exec);

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

async function extractAndConvert() {
  const carDir = path.join(process.cwd(), 'car');
  const dataDir = path.join(process.cwd(), 'data');
  const tempDir = path.join(process.cwd(), 'car', 'temp');

  // Create temp directory
  await fs.mkdir(tempDir, { recursive: true });

  // Find all ZIP files
  const files = await fs.readdir(carDir);
  const zipFiles = files.filter(f => f.endsWith('.zip') && f.includes('AREA_IMOVEL'));

  logger.info('Found CAR ZIP files', { count: zipFiles.length, files: zipFiles });

  const results = {
    success: [] as string[],
    failed: [] as { file: string; error: string }[]
  };

  for (const zipFile of zipFiles) {
    const zipPath = path.join(carDir, zipFile);
    const state = zipFile.split('_')[0].replace('-', '').toUpperCase();

    try {
      logger.info(`Processing ${state}...`);

      // Extract ZIP
      logger.info(`Extracting ${zipFile}...`);
      const extractDir = path.join(tempDir, state);
      await fs.mkdir(extractDir, { recursive: true });
      await execAsync(`unzip -o "${zipPath}" -d "${extractDir}"`);

      // Find .shp file
      const extractedFiles = await fs.readdir(extractDir);
      const shpFile = extractedFiles.find(f => f.endsWith('.shp'));

      if (!shpFile) {
        throw new Error('No .shp file found in ZIP');
      }

      const shpPath = path.join(extractDir, shpFile);
      const outputPath = path.join(dataDir, `car_${state.toLowerCase()}.json`);

      // Convert to GeoJSON using ogr2ogr
      logger.info(`Converting ${shpFile} to GeoJSON...`);
      await execAsync(`ogr2ogr -f GeoJSON "${outputPath}" "${shpPath}"`);

      // Check output file size
      const stats = await fs.stat(outputPath);
      const sizeMB = Math.round(stats.size / 1024 / 1024);

      logger.info(`✅ ${state} completed`, {
        outputFile: `car_${state.toLowerCase()}.json`,
        sizeMB
      });

      results.success.push(state);

      // Clean up temp directory for this state
      await fs.rm(extractDir, { recursive: true });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ ${state} failed`, { error: errorMsg });
      results.failed.push({ file: zipFile, error: errorMsg });
    }
  }

  // Clean up temp directory
  await fs.rm(tempDir, { recursive: true, force: true });

  // Summary
  logger.info('\n' + '='.repeat(60));
  logger.info('PROCESSING SUMMARY');
  logger.info('='.repeat(60));

  if (results.success.length > 0) {
    logger.info('✅ Success', {
      states: results.success.length,
      list: results.success.join(', ')
    });
  }

  if (results.failed.length > 0) {
    logger.error('❌ Failed', {
      states: results.failed.length,
      list: results.failed.map(f => f.file).join(', ')
    });
  }

  logger.info('='.repeat(60));
}

extractAndConvert().catch(error => {
  logger.error('Fatal error', { error: error.message });
  process.exit(1);
});
