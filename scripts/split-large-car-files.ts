#!/usr/bin/env tsx
/**
 * Split large CAR GeoJSON files into smaller chunks
 *
 * Solves "Invalid string length" error for files > 512 MB
 * Reads file in chunks and splits into multiple smaller files
 *
 * Usage:
 *   npm run split:car -- BA
 *   npm run split:car -- SP MG RS
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import readline from 'readline';

const CHUNK_SIZE = 50000; // Features per chunk (adjust based on file size)

async function splitGeoJSON(filepath: string) {
  const filename = path.basename(filepath);
  const state = filename.replace('car_', '').replace('.json', '').toUpperCase();

  console.log(`\n📦 Splitting ${state} (${filename})...`);

  const fileStream = fs.createReadStream(filepath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let features: any[] = [];
  let featureCount = 0;
  let chunkNum = 1;
  let inFeatures = false;
  let currentFeature = '';
  let braceCount = 0;

  const dataDir = path.dirname(filepath);

  for await (const line of rl) {
    // Detect start of features array
    if (line.includes('"features"')) {
      inFeatures = true;
      continue;
    }

    if (!inFeatures) continue;

    // Track feature boundaries using brace counting
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      currentFeature += char;

      // Complete feature detected
      if (braceCount === 0 && currentFeature.trim().startsWith('{')) {
        try {
          // Remove trailing comma if exists
          const cleanFeature = currentFeature.trim().replace(/,$/, '');
          const feature = JSON.parse(cleanFeature);
          features.push(feature);
          featureCount++;

          // Save chunk when reached size limit
          if (features.length >= CHUNK_SIZE) {
            await saveChunk(dataDir, state, chunkNum, features);
            console.log(`  ✅ Chunk ${chunkNum}: ${features.length} features (Total: ${featureCount})`);
            chunkNum++;
            features = [];
          }

          currentFeature = '';
        } catch (error) {
          // Skip invalid features
          currentFeature = '';
        }
      }
    }
  }

  // Save remaining features
  if (features.length > 0) {
    await saveChunk(dataDir, state, chunkNum, features);
    console.log(`  ✅ Chunk ${chunkNum}: ${features.length} features (Total: ${featureCount})`);
  }

  console.log(`\n✨ ${state} split into ${chunkNum} chunks (${featureCount} total features)`);

  return { state, chunks: chunkNum, totalFeatures: featureCount };
}

async function saveChunk(dataDir: string, state: string, chunkNum: number, features: any[]) {
  const chunkFilename = `car_${state.toLowerCase()}_chunk${chunkNum}.json`;
  const chunkPath = path.join(dataDir, chunkFilename);

  const geojson = {
    type: 'FeatureCollection',
    features
  };

  await fsPromises.writeFile(chunkPath, JSON.stringify(geojson), 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run split:car -- STATE1 [STATE2 ...]');
    console.error('Example: npm run split:car -- BA SP MG');
    process.exit(1);
  }

  const states = args.map(s => s.toUpperCase());
  const dataDir = path.join(process.cwd(), 'data');

  console.log('🔪 Splitting large CAR files...\n');
  console.log(`States: ${states.join(', ')}`);
  console.log(`Chunk size: ${CHUNK_SIZE.toLocaleString()} features per file\n`);

  const results = [];

  for (const state of states) {
    const filepath = path.join(dataDir, `car_${state.toLowerCase()}.json`);

    try {
      // Check if file exists
      await fsPromises.access(filepath);

      const result = await splitGeoJSON(filepath);
      results.push(result);

    } catch (error) {
      console.error(`❌ ${state}: File not found or error - ${filepath}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SPLIT SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    console.log(`${result.state}: ${result.chunks} chunks, ${result.totalFeatures.toLocaleString()} features`);
  }

  console.log('\n✅ Done! Now run:');
  console.log('npm run seed:car-v2\n');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
