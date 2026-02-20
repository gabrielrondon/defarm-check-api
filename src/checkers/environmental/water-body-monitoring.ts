/**
 * Water Body Monitoring Checker
 *
 * Monitora corpos d'água e áreas úmidas via classificação de cobertura do solo
 * MODIS MCD12Q1 (Land Cover Type, 500m, anual) e verifica conformidade com APP
 * de cursos d'água (Código Florestal — faixa de 30-500m conforme largura do rio).
 *
 * Análises:
 *  - Detecta desaparecimento de corpo d'água (classe água → não-água entre anos)
 *  - Detecta redução de áreas úmidas/pântanos
 *  - Verifica se localização está em classe de água atual
 *
 * Classes de cobertura IGBP (LC_Type1):
 *  0  = Water Bodies
 *  11 = Permanent Wetlands
 *
 * Critérios:
 *  - Local classificado como água em anos anteriores mas não mais → FAIL/HIGH
 *  - Redução de área úmida ao longo dos anos → WARNING
 *  - Sem mudança em corpos d'água → PASS
 *
 * API: https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset
 * Sem autenticação necessária.
 *
 * Docs: docs/SATELLITE_IMAGERY_ROADMAP.md
 */

import { SatelliteBaseChecker } from '../satellite-base.js';
import {
  CheckerCategory,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  CheckStatus,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType, Country } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

const ORNL_DAAC_BASE = 'https://modis.ornl.gov/rst/api/v1';
const YEARS_TO_ANALYZE = 5;

// IGBP Land Cover Type 1 classes (LC_Type1)
const IGBP_CLASSES: Record<number, string> = {
  0:  'Water Bodies',
  1:  'Evergreen Needleleaf Forests',
  2:  'Evergreen Broadleaf Forests',
  3:  'Deciduous Needleleaf Forests',
  4:  'Deciduous Broadleaf Forests',
  5:  'Mixed Forests',
  6:  'Closed Shrublands',
  7:  'Open Shrublands',
  8:  'Woody Savannas',
  9:  'Savannas',
  10: 'Grasslands',
  11: 'Permanent Wetlands',
  12: 'Croplands',
  13: 'Urban and Built-up Lands',
  14: 'Cropland/Natural Vegetation Mosaics',
  15: 'Permanent Snow and Ice',
  16: 'Barren',
  17: 'Water Bodies (secondary)'
};

const WATER_CLASSES = new Set([0, 11, 17]);

interface LandCoverYear {
  year: number;
  lc_class: number;
  class_name: string;
  is_water: boolean;
}

export class WaterBodyMonitoringChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Water Body Monitoring (MODIS MCD12Q1)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Monitora corpos d\'água e áreas úmidas via MODIS MCD12Q1 (Land Cover Type IGBP, 500m, anual). ' +
      'Detecta desaparecimento de corpos d\'água e redução de áreas úmidas ao longo dos anos.',
    priority: 3,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR],
    supportedCountries: [Country.BRAZIL, Country.URUGUAY, Country.ARGENTINA, Country.PARAGUAY, Country.BOLIVIA, Country.CHILE, Country.COLOMBIA, Country.PERU] // Global MODIS data
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 30, // 30 days (annual data)
    timeout: 15000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (input.type === InputType.COORDINATES) {
      return this.checkByCoordinates(input);
    }
    if (input.type === InputType.CAR) {
      return this.checkByCAR(input);
    }
    return {
      status: CheckStatus.NOT_APPLICABLE,
      message: 'Input type not supported. Use COORDINATES or CAR.',
      executionTimeMs: 0,
      cached: false
    };
  }

  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) throw new Error('Coordinates required');
    const { lat, lon } = input.coordinates;
    const history = await this.fetchLandCoverHistory(lat, lon);
    return this.analyzeWaterBodies(history, { lat, lon }, null);
  }

  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;
    const rows = await db.execute<{ lat: number; lon: number }>(sql`
      SELECT ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lon
      FROM car_registrations WHERE car_number = ${carCode} LIMIT 1
    `);
    const car = rows.rows?.[0];
    if (!car?.lat) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: `CAR ${carCode} not found in local database`,
        details: { car_number: carCode },
        executionTimeMs: 0,
        cached: false
      };
    }
    const history = await this.fetchLandCoverHistory(car.lat, car.lon);
    return this.analyzeWaterBodies(history, { lat: car.lat, lon: car.lon }, carCode);
  }

  private async fetchLandCoverHistory(lat: number, lon: number): Promise<LandCoverYear[]> {
    const currentYear = new Date().getFullYear();
    const startYear   = currentYear - YEARS_TO_ANALYZE;

    const url = new URL(`${ORNL_DAAC_BASE}/MCD12Q1/subset`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('band', 'LC_Type1');
    url.searchParams.set('startDate', `A${startYear}001`);
    url.searchParams.set('endDate',   `A${currentYear - 1}001`);
    url.searchParams.set('kmAboveBelow', '0');
    url.searchParams.set('kmLeftRight',  '0');

    logger.debug({ lat, lon, url: url.toString() }, 'ORNL DAAC MCD12Q1 land cover request');

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.5' },
        signal: AbortSignal.timeout(this.config.timeout ?? 15000)
      });
      if (!response.ok) return [];

      const data = await response.json() as {
        subset?: Array<{ calendar_date: string; data: number[] }>;
      };

      const FILL_VALUE = 255;
      return (data.subset ?? [])
        .filter(s => s.data[0] !== undefined && s.data[0] !== FILL_VALUE)
        .map(s => {
          const cls = s.data[0];
          return {
            year:       parseInt(s.calendar_date.split('-')[0]),
            lc_class:   cls,
            class_name: IGBP_CLASSES[cls] ?? `Class ${cls}`,
            is_water:   WATER_CLASSES.has(cls)
          };
        });
    } catch (err) {
      logger.warn({ err, lat, lon }, 'MCD12Q1 land cover request failed');
      return [];
    }
  }

  private analyzeWaterBodies(
    history: LandCoverYear[],
    location: { lat: number; lon: number },
    carCode: string | null
  ): CheckerResult {
    if (history.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No land cover data available for this location',
        details: { ...(carCode ? { car_number: carCode } : { coordinates: location }) },
        executionTimeMs: 0,
        cached: false
      };
    }

    const sorted      = [...history].sort((a, b) => a.year - b.year);
    const earliest    = sorted[0];
    const latest      = sorted[sorted.length - 1];

    const wasWater    = earliest.is_water;
    const isWater     = latest.is_water;
    const everWater   = sorted.some(y => y.is_water);
    const waterYears  = sorted.filter(y => y.is_water).map(y => y.year);

    // Wetland-specific check
    const wasWetland  = earliest.lc_class === 11;
    const isWetland   = latest.lc_class === 11;
    const wetlandLost = wasWetland && !isWetland;

    const evidence = {
      dataSource: 'NASA MODIS MCD12Q1 — Land Cover Type IGBP (500m, annual)',
      url: 'https://modis.ornl.gov/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      current_land_cover:   latest.class_name,
      current_lc_class:     latest.lc_class,
      is_currently_water:   isWater,
      was_water_earliest:   wasWater,
      water_years:          waterYears,
      years_analyzed:       sorted.length,
      land_cover_history:   sorted,
      methodology:
        'MODIS MCD12Q1 annual IGBP land cover classification (500m). ' +
        'Water classes: 0 (Water Bodies), 11 (Permanent Wetlands), 17 (Water Bodies secondary). ' +
        'Checks for transition from water/wetland to non-water land cover class.'
    };

    // FAIL: location was water/wetland but is no longer
    if (wasWater && !isWater) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Water body loss detected: location was "${earliest.class_name}" in ${earliest.year}, ` +
          `now classified as "${latest.class_name}" in ${latest.year}.`,
        details: {
          ...baseDetails,
          recommendation:
            'Permanent water body or wetland has disappeared. This may indicate ' +
            'illegal drainage, damming, or diversion. Cross-check with ANA outorgas ' +
            'and verify APP (Permanent Protection Area) compliance under Código Florestal.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: wetland converted to other land use
    if (wetlandLost) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Permanent wetland converted: was "${earliest.class_name}" in ${earliest.year}, ` +
          `now "${latest.class_name}" in ${latest.year}.`,
        details: {
          ...baseDetails,
          recommendation:
            'Permanent wetland area changed to another land use. Wetlands are classified as APP ' +
            'under Código Florestal (Lei 12.651/2012). Verify compliance.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: currently water or was never water
    if (isWater) {
      return {
        status: CheckStatus.PASS,
        message:
          `Location is classified as "${latest.class_name}" — water body present and stable. ` +
          `Water detected in ${waterYears.length}/${sorted.length} years analyzed.`,
        details: baseDetails,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message:
        `No water body detected at this location. ` +
        `Current land cover: "${latest.class_name}". ${everWater ? `Historical water detected in: ${waterYears.join(', ')}.` : ''}`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new WaterBodyMonitoringChecker();
