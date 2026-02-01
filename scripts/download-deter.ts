#!/usr/bin/env tsx
/**
 * Script para baixar alertas DETER do INPE TerraBrasilis
 *
 * DETER-B (Detecção de Desmatamento em Tempo Real - Amazônia)
 * Fonte: INPE - Instituto Nacional de Pesquisas Espaciais
 * URL: http://terrabrasilis.dpi.inpe.br/
 *
 * Frequência: Alertas diários de desmatamento
 * Cobertura: Amazônia Legal (9 estados)
 *
 * Uso:
 *   npm run data:deter-daily          # Últimos alertas (ontem)
 *   npm run data:deter-range 2026-01-01 2026-01-31  # Período específico
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger, format, transports } from 'winston';
import { retryFetch, GOVERNMENT_API_RETRY_CONFIG } from '../src/utils/retry.js';

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
 * DETER WFS API endpoints
 * Docs: http://terrabrasilis.dpi.inpe.br/geonetwork/srv/por/catalog.search#/home
 */
const DETER_WFS_URL = 'http://terrabrasilis.dpi.inpe.br/geoserver/ows';
const DETER_LAYER = 'deter-amz:deter_public';  // Layer público do DETER Amazônia

interface DeterAlert {
  alertDate: string;  // YYYY-MM-DD
  areaHa: number;
  state: string;
  municipality: string;
  classname: string;  // DESMATAMENTO_VEG, DEGRADACAO, MINERACAO, etc
  sensor: string;     // LANDSAT_8, SENTINEL_2, etc
  pathRow: string;
  geometry: string;   // WKT format (MULTIPOLYGON)
}

/**
 * Download alertas DETER via WFS (Web Feature Service)
 * Protocol: OGC WFS 2.0
 */
async function downloadDeterAlerts(startDate: string, endDate: string): Promise<DeterAlert[]> {
  logger.info('Downloading DETER alerts from TerraBrasilis', { startDate, endDate });

  // Construir query WFS
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typename: DETER_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',  // WGS84
    // Filtro por data (CQL filter)
    CQL_FILTER: `view_date >= '${startDate}' AND view_date <= '${endDate}'`
  });

  const url = `${DETER_WFS_URL}?${params.toString()}`;

  logger.info('Fetching from WFS', { url: url.slice(0, 150) + '...' });

  try {
    // Use retry logic for unstable government APIs
    const response = await retryFetch(url, {
      headers: {
        'User-Agent': 'DeFarm-CheckAPI/1.0'
      }
    }, GOVERNMENT_API_RETRY_CONFIG);

    const data = await response.json();

    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Invalid GeoJSON response from WFS');
    }

    logger.info(`Received ${data.features.length} alerts from WFS`);

    // Parse GeoJSON features para nosso formato
    const alerts: DeterAlert[] = data.features.map((feature: any) => {
      const props = feature.properties;
      const geom = feature.geometry;

      // Converter geometria para WKT (Well-Known Text)
      const wkt = geojsonToWKT(geom);

      return {
        alertDate: props.view_date || props.date,  // Data do alerta
        areaHa: Math.round(props.areatotalkm * 100) || 0,  // Converter km² para hectares
        state: props.uf || '',
        municipality: props.municipali || props.municipality || '',
        classname: props.classname || '',
        sensor: props.sensor || '',
        pathRow: props.path_row || props.pathrow || '',
        geometry: wkt
      };
    });

    return alerts;

  } catch (error) {
    logger.error('Failed to download DETER alerts', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

/**
 * Converter GeoJSON geometry para WKT (Well-Known Text)
 * PostGIS aceita WKT para INSERT
 */
function geojsonToWKT(geometry: any): string {
  const type = geometry.type.toUpperCase();
  const coords = geometry.coordinates;

  if (type === 'MULTIPOLYGON') {
    // MultiPolygon: [[[x,y], [x,y]...]] -> MULTIPOLYGON(((x y, x y...)))
    const polygons = coords.map((polygon: any) => {
      const rings = polygon.map((ring: any) => {
        const points = ring.map((coord: any) => `${coord[0]} ${coord[1]}`).join(', ');
        return `(${points})`;
      }).join(', ');
      return `(${rings})`;
    }).join(', ');

    return `MULTIPOLYGON(${polygons})`;
  } else if (type === 'POLYGON') {
    // Polygon: [[x,y], [x,y]...] -> POLYGON((x y, x y...))
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
 * Salvar alertas em arquivo JSON
 */
async function saveToFile(alerts: DeterAlert[], filename: string) {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(alerts, null, 2), 'utf-8');

  logger.info(`Saved ${alerts.length} alerts to ${filepath}`);

  // Stats
  const totalArea = alerts.reduce((sum, a) => sum + a.areaHa, 0);
  const byClass = alerts.reduce((acc, a) => {
    acc[a.classname] = (acc[a.classname] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  logger.info('Stats', {
    totalAlerts: alerts.length,
    totalAreaHa: totalArea,
    byClassname: byClass
  });

  return filepath;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  let startDate: string;
  let endDate: string;

  if (args.length === 0) {
    // Default: ontem (alertas do dia anterior)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    startDate = yesterday.toISOString().split('T')[0];
    endDate = startDate;
  } else if (args.length === 2) {
    // Range: npm run data:deter-range 2026-01-01 2026-01-31
    [startDate, endDate] = args;
  } else {
    logger.error('Usage: npm run data:deter-daily OR npm run data:deter-range YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
  }

  logger.info('Starting DETER download', { startDate, endDate });

  try {
    const alerts = await downloadDeterAlerts(startDate, endDate);

    if (alerts.length === 0) {
      logger.warn('No alerts found for this period');
      return;
    }

    // Salvar
    const filename = startDate === endDate
      ? `deter_alerts_${startDate}.json`
      : `deter_alerts_${startDate}_to_${endDate}.json`;

    await saveToFile(alerts, filename);

    logger.info('✅ DETER download completed successfully');

  } catch (error) {
    logger.error('❌ DETER download failed', { error });
    process.exit(1);
  }
}

// Run if executed directly (ES modules)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { downloadDeterAlerts, geojsonToWKT };
