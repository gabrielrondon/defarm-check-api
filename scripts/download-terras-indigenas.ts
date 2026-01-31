#!/usr/bin/env tsx
/**
 * Script para baixar polígonos de Terras Indígenas da FUNAI
 *
 * Fonte: FUNAI - Fundação Nacional dos Povos Indígenas
 * GeoServer: https://geoserver.funai.gov.br/
 *
 * O que são Terras Indígenas:
 * - Áreas demarcadas para povos indígenas
 * - Fases: Declarada, Homologada, Regularizada
 * - Atividade econômica é restrita/proibida
 * - Comprar/produzir em TI = CRIME
 *
 * Uso:
 *   npm run data:funai-terras-indigenas
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

/**
 * FUNAI GeoServer WFS endpoint
 * Docs: https://geoserver.funai.gov.br/geoserver/web/
 */
const FUNAI_WFS_URL = 'https://geoserver.funai.gov.br/geoserver/Funai/ows';
const TI_LAYER = 'Funai:tis_poligonais';  // Layer de Terras Indígenas

interface TerraIndigena {
  name: string;
  etnia: string;
  phase: string;  // Fase da demarcação
  areaHa: number;
  state: string;
  municipality: string;
  modalidade: string;  // Tipo de TI
  geometry: string;  // WKT format
}

/**
 * Download Terras Indígenas via WFS
 */
async function downloadTerrasIndigenas(): Promise<TerraIndigena[]> {
  logger.info('Downloading Terras Indígenas from FUNAI GeoServer');

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typename: TI_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326'  // WGS84
  });

  const url = `${FUNAI_WFS_URL}?${params.toString()}`;

  logger.info('Fetching from WFS', { url: url.slice(0, 150) + '...' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeFarm-CheckAPI/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`WFS request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Invalid GeoJSON response from WFS');
    }

    logger.info(`Received ${data.features.length} Terras Indígenas from WFS`);

    // Parse GeoJSON features
    const terras: TerraIndigena[] = data.features.map((feature: any) => {
      const props = feature.properties;
      const geom = feature.geometry;

      // Converter geometria para WKT
      const wkt = geojsonToWKT(geom);

      return {
        name: props.terrai_nom || props.nome || '',
        etnia: props.etnia_nome || props.etnia || '',
        phase: props.fase_ti || props.fase || '',
        areaHa: Math.round((props.area_ha || props.area || 0)),
        state: props.uf_sigla || props.uf || '',
        municipality: props.municipio_nome || props.municipio || '',
        modalidade: props.modalidade || '',
        geometry: wkt
      };
    });

    return terras;

  } catch (error) {
    logger.error('Failed to download Terras Indígenas', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Converter GeoJSON geometry para WKT
 */
function geojsonToWKT(geometry: any): string {
  const type = geometry.type.toUpperCase();
  const coords = geometry.coordinates;

  if (type === 'MULTIPOLYGON') {
    const polygons = coords.map((polygon: any) => {
      const rings = polygon.map((ring: any) => {
        const points = ring.map((coord: any) => `${coord[0]} ${coord[1]}`).join(', ');
        return `(${points})`;
      }).join(', ');
      return `(${rings})`;
    }).join(', ');

    return `MULTIPOLYGON(${polygons})`;
  } else if (type === 'POLYGON') {
    const rings = coords.map((ring: any) => {
      const points = ring.map((coord: any) => `${coord[0]} ${coord[1]}`).join(', ');
      return `(${points})`;
    }).join(', ');

    return `POLYGON(${rings})`;
  } else {
    throw new Error(`Unsupported geometry type: ${type}`);
  }
}

/**
 * Salvar Terras Indígenas em arquivo JSON
 */
async function saveToFile(terras: TerraIndigena[], filename: string = 'terras_indigenas.json') {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(terras, null, 2), 'utf-8');

  logger.info(`Saved ${terras.length} Terras Indígenas to ${filepath}`);

  // Stats
  const totalArea = terras.reduce((sum, t) => sum + t.areaHa, 0);
  const byPhase = terras.reduce((acc, t) => {
    acc[t.phase] = (acc[t.phase] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byState = terras.reduce((acc, t) => {
    acc[t.state] = (acc[t.state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  logger.info('Stats', {
    totalTerras: terras.length,
    totalAreaHa: totalArea,
    totalAreaMilhoes: Math.round(totalArea / 1000000),
    byPhase,
    byState
  });

  return filepath;
}

/**
 * Main
 */
async function main() {
  logger.info('Starting Terras Indígenas download from FUNAI');

  try {
    const terras = await downloadTerrasIndigenas();

    if (terras.length === 0) {
      logger.warn('No Terras Indígenas found');
      return;
    }

    await saveToFile(terras);

    logger.info('✅ Terras Indígenas download completed successfully');

  } catch (error) {
    logger.error('❌ Download failed', { error });
    process.exit(1);
  }
}

// Run
main();

export { downloadTerrasIndigenas, geojsonToWKT };
