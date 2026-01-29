#!/usr/bin/env tsx
/**
 * Script para baixar registros CAR (Cadastro Ambiental Rural) do SICAR
 *
 * Fonte: SICAR - Sistema Nacional de Cadastro Ambiental Rural
 * GeoServer: https://geoserver.car.gov.br/
 *
 * O que é CAR:
 * - Registro obrigatório de propriedades rurais
 * - Contém polígono georreferenciado da propriedade
 * - Status: Ativo (regularizado), Pendente, Cancelado, Suspenso
 * - NÃO ter CAR ativo = IRREGULAR (alto risco)
 *
 * Estados cobertos: TODOS os 27 UFs do Brasil (26 estados + DF)
 *
 * Principais (90% do agro):
 * - MT, PA, GO, MS, RS, PR, SP, MG, BA, TO
 *
 * Uso:
 *   npm run data:car <UF>  # Baixar um estado específico
 *
 *   Exemplos:
 *   npm run data:car MT    # Mato Grosso
 *   npm run data:car PA    # Pará
 *   npm run data:car SP    # São Paulo
 *
 *   npm run data:car-all   # Baixar TODOS os 27 estados (CUIDADO: muito pesado!)
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
 * SICAR GeoServer WFS endpoint
 * Docs: https://geoserver.car.gov.br/geoserver/web/
 */
const SICAR_WFS_URL = 'https://geoserver.car.gov.br/geoserver/sicar/wfs';

// Layer names por estado (todos os 27 UFs do Brasil)
const STATE_LAYERS: Record<string, string> = {
  // Norte
  'AC': 'sicar:sicar_imoveis_ac',
  'AP': 'sicar:sicar_imoveis_ap',
  'AM': 'sicar:sicar_imoveis_am',
  'PA': 'sicar:sicar_imoveis_pa',
  'RO': 'sicar:sicar_imoveis_ro',
  'RR': 'sicar:sicar_imoveis_rr',
  'TO': 'sicar:sicar_imoveis_to',
  // Nordeste
  'AL': 'sicar:sicar_imoveis_al',
  'BA': 'sicar:sicar_imoveis_ba',
  'CE': 'sicar:sicar_imoveis_ce',
  'MA': 'sicar:sicar_imoveis_ma',
  'PB': 'sicar:sicar_imoveis_pb',
  'PE': 'sicar:sicar_imoveis_pe',
  'PI': 'sicar:sicar_imoveis_pi',
  'RN': 'sicar:sicar_imoveis_rn',
  'SE': 'sicar:sicar_imoveis_se',
  // Centro-Oeste
  'DF': 'sicar:sicar_imoveis_df',
  'GO': 'sicar:sicar_imoveis_go',
  'MS': 'sicar:sicar_imoveis_ms',
  'MT': 'sicar:sicar_imoveis_mt',
  // Sudeste
  'ES': 'sicar:sicar_imoveis_es',
  'MG': 'sicar:sicar_imoveis_mg',
  'RJ': 'sicar:sicar_imoveis_rj',
  'SP': 'sicar:sicar_imoveis_sp',
  // Sul
  'PR': 'sicar:sicar_imoveis_pr',
  'RS': 'sicar:sicar_imoveis_rs',
  'SC': 'sicar:sicar_imoveis_sc'
};

interface CARRegistration {
  carNumber: string;
  status: string;
  ownerDocument: string;
  ownerName: string;
  propertyName: string;
  areaHa: number;
  state: string;
  municipality: string;
  geometry: string;  // WKT format
}

/**
 * Download CAR registrations via WFS
 */
async function downloadCARByState(stateCode: string): Promise<CARRegistration[]> {
  const layerName = STATE_LAYERS[stateCode];

  if (!layerName) {
    throw new Error(`State ${stateCode} not supported. Available: ${Object.keys(STATE_LAYERS).join(', ')}`);
  }

  logger.info('Downloading CAR registrations from SICAR GeoServer', { state: stateCode, layer: layerName });

  // WFS GetFeature request
  // NOTA: Limitar a 10000 features por request (limite do GeoServer)
  // Para estados grandes, precisará de paginação
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typename: layerName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',  // WGS84
    count: '10000'  // Limite de features
  });

  const url = `${SICAR_WFS_URL}?${params.toString()}`;

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

    logger.info(`Received ${data.features.length} CAR registrations from WFS`);

    // Parse GeoJSON features
    const cars: CARRegistration[] = data.features.map((feature: any) => {
      const props = feature.properties;
      const geom = feature.geometry;

      // Converter geometria para WKT
      const wkt = geojsonToWKT(geom);

      // Extrair número do CAR (pode estar em diferentes campos)
      const carNumber = props.cod_imovel || props.car || props.numero_car || props.num_car || '';

      // Status (pode estar em diferentes formatos)
      const status = normalizeStatus(props.status || props.situacao || props.des_condicao || 'ATIVO');

      // Área em hectares
      const areaHa = Math.round(props.num_area || props.area_ha || props.area || 0);

      return {
        carNumber: String(carNumber).trim(),
        status,
        ownerDocument: String(props.cpf_cnpj || props.num_cpf_cnpj || props.documento || '').trim(),
        ownerName: String(props.nom_imovel || props.nome_propriedade || props.nome || '').trim(),
        propertyName: String(props.nom_imovel || props.nome || '').trim(),
        areaHa,
        state: stateCode,
        municipality: String(props.nom_municipio || props.municipio || '').trim(),
        geometry: wkt
      };
    });

    // Filtrar registros inválidos (sem número CAR)
    const validCars = cars.filter(car => car.carNumber && car.carNumber.length > 0);

    logger.info(`Processed ${validCars.length} valid CAR registrations (${cars.length - validCars.length} invalid)`);

    return validCars;

  } catch (error) {
    logger.error('Failed to download CAR registrations', {
      state: stateCode,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Normalizar status do CAR
 */
function normalizeStatus(status: string): string {
  const statusUpper = status.toUpperCase().trim();

  // Mapear diferentes formatos de status
  if (statusUpper.includes('ATIVO') || statusUpper.includes('ACTIVE')) {
    return 'ATIVO';
  } else if (statusUpper.includes('PENDENTE') || statusUpper.includes('PENDING')) {
    return 'PENDENTE';
  } else if (statusUpper.includes('CANCELADO') || statusUpper.includes('CANCELLED')) {
    return 'CANCELADO';
  } else if (statusUpper.includes('SUSPENSO') || statusUpper.includes('SUSPENDED')) {
    return 'SUSPENSO';
  } else {
    return statusUpper;
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
 * Salvar CAR registrations em arquivo JSON
 */
async function saveToFile(cars: CARRegistration[], stateCode: string) {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const filename = `car_${stateCode.toLowerCase()}.json`;
  const filepath = path.join(dataDir, filename);
  await fs.writeFile(filepath, JSON.stringify(cars, null, 2), 'utf-8');

  logger.info(`Saved ${cars.length} CAR registrations to ${filepath}`);

  // Stats
  const totalArea = cars.reduce((sum, car) => sum + car.areaHa, 0);
  const byStatus = cars.reduce((acc, car) => {
    acc[car.status] = (acc[car.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byMunicipality = cars.reduce((acc, car) => {
    if (car.municipality) {
      acc[car.municipality] = (acc[car.municipality] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  logger.info('Stats', {
    state: stateCode,
    totalRegistrations: cars.length,
    totalAreaHa: totalArea,
    totalAreaMilhoes: Math.round(totalArea / 1000000),
    byStatus,
    municipalities: Object.keys(byMunicipality).length
  });

  return filepath;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: npm run data:car <UF>');
    logger.error('Examples:');
    logger.error('  npm run data:car MT  # Mato Grosso');
    logger.error('  npm run data:car SP  # São Paulo');
    logger.error('  npm run data:car PA  # Pará');
    logger.error('');
    logger.error('Available: AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT,');
    logger.error('           PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO');
    process.exit(1);
  }

  const stateCode = args[0].toUpperCase();

  try {
    const cars = await downloadCARByState(stateCode);

    if (cars.length === 0) {
      logger.warn('No CAR registrations found');
      return;
    }

    await saveToFile(cars, stateCode);

    logger.info('✅ CAR registrations download completed successfully');

  } catch (error) {
    logger.error('❌ Download failed', { error });
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  main();
}

export { downloadCARByState, geojsonToWKT, normalizeStatus };
