#!/usr/bin/env tsx
/**
 * Quick diagnostic to test PRODES GeoJSON parsing
 */
import fs from 'fs/promises';
import path from 'path';

const filepath = path.join(process.cwd(), 'data', 'prodes_amazonia_5y.json');

console.log('Reading file:', filepath);
console.time('Read file');
const content = await fs.readFile(filepath, 'utf-8');
console.timeEnd('Read file');

console.log('File size:', Math.round(content.length / 1024 / 1024), 'MB');

console.time('Parse JSON');
const geojson = JSON.parse(content);
console.timeEnd('Parse JSON');

console.log('Type:', geojson.type);
console.log('Features array exists:', !!geojson.features);
console.log('Features is array:', Array.isArray(geojson.features));
console.log('Features count:', geojson.features?.length || 0);

if (geojson.features && geojson.features.length > 0) {
  console.log('\nFirst feature:');
  console.log('- ID:', geojson.features[0].id);
  console.log('- Type:', geojson.features[0].type);
  console.log('- Geometry type:', geojson.features[0].geometry?.type);
  console.log('- Properties:', Object.keys(geojson.features[0].properties || {}));
  console.log('- Full properties:', JSON.stringify(geojson.features[0].properties, null, 2));
}
