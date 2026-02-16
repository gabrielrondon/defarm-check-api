#!/usr/bin/env tsx
/**
 * Script para baixar polígonos de Áreas Protegidas do SNAP (Uruguay)
 *
 * Fonte: SNAP - Sistema Nacional de Áreas Protegidas
 * URL: https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
 *
 * O que são Áreas SNAP:
 * - 22 áreas protegidas (367,683 hectares / 1.16% do território uruguaio)
 * - Categorias: Parque Nacional, Monumento Natural, etc
 * - Atividades requerem autorização especial
 * - Lei 17.234/2000 - Sistema Nacional de Áreas Protegidas
 *
 * Uso:
 *   npm run data:snap-areas
 *
 * NOTA: Este script requer download manual do Shapefile do portal SNAP
 * e conversão para GeoJSON usando ogr2ogr ou similar.
 *
 * Passos:
 * 1. Baixar Shapefile de: https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
 * 2. Converter para GeoJSON: ogr2ogr -f GeoJSON snap_areas.json snap_areas.shp
 * 3. Colocar arquivo em: data/uruguay/snap_areas.json
 * 4. Rodar este script
 */

import fs from 'fs/promises';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data', 'uruguay');
const OUTPUT_FILE = path.join(DATA_DIR, 'snap_areas.json');

interface SNAPArea {
  name: string;
  category: string;
  areaHa: number;
  department: string;
  municipality?: string;
  legalStatus?: string;
  establishedDate?: string;
  geometry: any; // GeoJSON geometry
}

/**
 * NOTA: Este é um script de validação/normalização.
 * O download real deve ser feito manualmente do portal SNAP.
 *
 * Links úteis:
 * - Metadados: https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
 * - Portal SNAP: https://www.ambiente.gub.uy/snap
 * - Contato: secretaria.snap@ambiente.gub.uy
 */
async function processSnapAreas(): Promise<void> {
  logger.info('Processing SNAP protected areas data');

  // Criar diretório se não existir
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Verificar se arquivo existe
  try {
    await fs.access(OUTPUT_FILE);
    logger.info(`Found SNAP data file: ${OUTPUT_FILE}`);

    // Validar formato
    const content = await fs.readFile(OUTPUT_FILE, 'utf-8');
    const geojson = JSON.parse(content);

    if (!geojson.features || !Array.isArray(geojson.features)) {
      throw new Error('Invalid GeoJSON format: missing features array');
    }

    logger.info(`Validated GeoJSON with ${geojson.features.length} features`);

    // Mostrar resumo
    const areas = geojson.features.map((f: any) => ({
      name: f.properties.name || f.properties.nombre || 'Unknown',
      category: f.properties.category || f.properties.categoria || 'Unknown',
      department: f.properties.department || f.properties.departamento || 'Unknown'
    }));

    logger.info('SNAP Areas found:', {
      count: areas.length,
      areas: areas.slice(0, 5)  // Mostrar primeiras 5
    });

    logger.info('✓ SNAP data ready for seeding');
    logger.info(`  Run: npm run seed:snap-areas`);

  } catch (err) {
    if ((err as any).code === 'ENOENT') {
      logger.warn(`SNAP data file not found: ${OUTPUT_FILE}`);
      logger.info(`
========================================
  MANUAL DOWNLOAD REQUIRED
========================================

The SNAP protected areas data must be downloaded manually:

1. Visit: https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
2. Download the Shapefile
3. Convert to GeoJSON using ogr2ogr:

   ogr2ogr -f GeoJSON snap_areas.json snap_areas.shp

4. Move the file to: ${OUTPUT_FILE}
5. Run this script again: npm run data:snap-areas

Alternative: Check IDE Uruguay WFS service:
- WFS Base: https://mapas.ide.uy/geoserver-vectorial/ideuy/ows
- Execute GetCapabilities to find SNAP layer name

Contact: secretaria.snap@ambiente.gub.uy
      `);
    } else {
      throw err;
    }
  }
}

// Executar
processSnapAreas().catch((err) => {
  logger.error('Failed to process SNAP areas', { error: err.message, stack: err.stack });
  process.exit(1);
});
