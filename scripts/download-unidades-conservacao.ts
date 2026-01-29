#!/usr/bin/env tsx
/**
 * Script para baixar polígonos de Unidades de Conservação do ICMBio
 *
 * Fonte: ICMBio - Instituto Chico Mendes de Conservação da Biodiversidade
 * GeoServer: https://geoserver.icmbio.gov.br/
 *
 * O que são Unidades de Conservação:
 * - Áreas protegidas para conservação da biodiversidade
 * - Dois grupos:
 *   1. Proteção Integral: uso indireto (Parques, Reservas Biológicas)
 *   2. Uso Sustentável: uso sustentável permitido (APAs, FLONAs)
 * - Atividade econômica é restrita/regulamentada
 * - Produzir em UC Proteção Integral = CRIME
 *
 * Uso:
 *   npm run data:icmbio-unidades-conservacao
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
 * ICMBio GeoServer WFS endpoint
 * Docs: https://geoserver.icmbio.gov.br/geoserver/web/
 */
const ICMBIO_WFS_URL = 'https://geoserver.icmbio.gov.br/geoserver/ows';
const UC_LAYER = 'BCIM:unidades_conservacao';  // Layer de Unidades de Conservação

interface UnidadeConservacao {
  name: string;
  category: string;  // Categoria (Parque Nacional, Reserva Biológica, etc)
  group: string;  // Proteção Integral ou Uso Sustentável
  areaHa: number;
  state: string;
  municipality: string;
  sphere: string;  // Federal, Estadual, Municipal
  geometry: string;  // WKT format
}

/**
 * Download Unidades de Conservação via WFS
 */
async function downloadUnidadesConservacao(): Promise<UnidadeConservacao[]> {
  logger.info('Downloading Unidades de Conservação from ICMBio GeoServer');

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typename: UC_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326'  // WGS84
  });

  const url = `${ICMBIO_WFS_URL}?${params.toString()}`;

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

    logger.info(`Received ${data.features.length} Unidades de Conservação from WFS`);

    // Parse GeoJSON features
    const ucs: UnidadeConservacao[] = data.features.map((feature: any) => {
      const props = feature.properties;
      const geom = feature.geometry;

      // Converter geometria para WKT
      const wkt = geojsonToWKT(geom);

      // Determinar grupo (Proteção Integral ou Uso Sustentável)
      const group = determineGroup(props.categoria || props.category || '');

      return {
        name: props.nome || props.name || '',
        category: props.categoria || props.category || '',
        group,
        areaHa: Math.round((props.area_ha || props.area || 0)),
        state: props.uf || props.state || '',
        municipality: props.municipio || props.municipality || '',
        sphere: props.esfera || props.sphere || 'Federal',
        geometry: wkt
      };
    });

    return ucs;

  } catch (error) {
    logger.error('Failed to download Unidades de Conservação', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Determinar grupo da UC baseado na categoria
 */
function determineGroup(category: string): string {
  const protecaoIntegral = [
    'Estação Ecológica',
    'Reserva Biológica',
    'Parque Nacional',
    'Monumento Natural',
    'Refúgio de Vida Silvestre',
    'ESEC',
    'REBIO',
    'PARNA',
    'MONA',
    'REVIS'
  ];

  const usoSustentavel = [
    'Área de Proteção Ambiental',
    'Área de Relevante Interesse Ecológico',
    'Floresta Nacional',
    'Reserva Extrativista',
    'Reserva de Fauna',
    'Reserva de Desenvolvimento Sustentável',
    'Reserva Particular do Patrimônio Natural',
    'APA',
    'ARIE',
    'FLONA',
    'RESEX',
    'REFAU',
    'RDS',
    'RPPN'
  ];

  const catUpper = category.toUpperCase();

  for (const pi of protecaoIntegral) {
    if (catUpper.includes(pi.toUpperCase())) {
      return 'Proteção Integral';
    }
  }

  for (const us of usoSustentavel) {
    if (catUpper.includes(us.toUpperCase())) {
      return 'Uso Sustentável';
    }
  }

  // Default: se não identificou, assume Proteção Integral (mais restritivo)
  return 'Proteção Integral';
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
 * Salvar Unidades de Conservação em arquivo JSON
 */
async function saveToFile(ucs: UnidadeConservacao[], filename: string = 'unidades_conservacao.json') {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(ucs, null, 2), 'utf-8');

  logger.info(`Saved ${ucs.length} Unidades de Conservação to ${filepath}`);

  // Stats
  const totalArea = ucs.reduce((sum, uc) => sum + uc.areaHa, 0);
  const byGroup = ucs.reduce((acc, uc) => {
    acc[uc.group] = (acc[uc.group] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byCategory = ucs.reduce((acc, uc) => {
    acc[uc.category] = (acc[uc.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bySphere = ucs.reduce((acc, uc) => {
    acc[uc.sphere] = (acc[uc.sphere] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  logger.info('Stats', {
    totalUCs: ucs.length,
    totalAreaHa: totalArea,
    totalAreaMilhoes: Math.round(totalArea / 1000000),
    byGroup,
    byCategory: Object.keys(byCategory).length + ' categorias',
    bySphere
  });

  return filepath;
}

/**
 * Main
 */
async function main() {
  logger.info('Starting Unidades de Conservação download from ICMBio');

  try {
    const ucs = await downloadUnidadesConservacao();

    if (ucs.length === 0) {
      logger.warn('No Unidades de Conservação found');
      return;
    }

    await saveToFile(ucs);

    logger.info('✅ Unidades de Conservação download completed successfully');

  } catch (error) {
    logger.error('❌ Download failed', { error });
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  main();
}

export { downloadUnidadesConservacao, geojsonToWKT, determineGroup };
