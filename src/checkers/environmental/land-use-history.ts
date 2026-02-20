/**
 * Land Use Conversion History Checker
 *
 * Analisa a trajetória histórica de uso do solo (1985-2024) via MapBiomas Collection.
 * Detecta conversões de floresta nativa para uso antrópico e verifica o corte temporal
 * do Código Florestal Brasileiro (Lei 12.651/2012).
 *
 * Lógica:
 *  - Conversão de nativo → antrópico após 2019       → FAIL/CRITICAL
 *  - Conversão de nativo → antrópico entre 2013-2019 → FAIL/HIGH
 *  - Conversão de nativo → antrópico antes de 2013   → WARNING (possível anistia)
 *  - Sempre foi antrópico (sem nativo no histórico)   → WARNING
 *  - Nativo em 2024 (sem conversão recente)          → PASS
 *
 * API: https://prd.plataforma.mapbiomas.org/api/v1/brazil/maps/pixel-history
 * Sem autenticação necessária (API pública).
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
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

// MapBiomas Collection REST API (public, no auth required)
const COLLECTION_API_BASE = 'https://prd.plataforma.mapbiomas.org/api/v1/brazil';

// Land cover pixel values from MapBiomas default legend
const NATIVE_CLASSES = new Set([1, 3, 4, 5, 6, 10, 11, 12, 13, 32, 49, 50]);
const ANTHROPIC_CLASSES = new Set([15, 18, 19, 20, 21, 22, 24, 25, 29, 30, 39, 40, 41, 46, 47, 48, 62]);

const CLASS_NAMES: Record<number, string> = {
  1:  'Forest (aggregate)',
  3:  'Forest Formation',
  4:  'Savanna Formation',
  5:  'Mangrove',
  6:  'Floodable Forest',
  10: 'Herbaceous/Shrubby Vegetation',
  11: 'Wetland',
  12: 'Grassland Formation',
  13: 'Other Forest Formations',
  15: 'Pasture',
  18: 'Agriculture',
  19: 'Temporary Crop',
  20: 'Sugarcane',
  21: 'Mosaic Agriculture/Pasture',
  22: 'Non-vegetated Area',
  24: 'Urban Area',
  25: 'Other Non-vegetated',
  29: 'Rocky Outcrop',
  30: 'Mining',
  32: 'Salt Flat',
  33: 'Water Bodies',
  39: 'Soybean',
  40: 'Rice',
  41: 'Other Temporary Crops',
  46: 'Coffee',
  47: 'Citrus',
  48: 'Other Perennial Crops',
  49: 'Wooded Restinga',
  50: 'Herbaceous Restinga',
  62: 'Cotton'
};

// Código Florestal cut-off year (Lei 12.651/2012 - conversions before this may qualify for amnesty)
const CODIGO_FLORESTAL_YEAR = 2012;
const RECENT_CONVERSION_YEAR = 2019;

interface PixelYear {
  pixelValue: number;
  year: number;
}

export class LandUseHistoryChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Land Use Conversion History (MapBiomas)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Analisa trajetória histórica de uso do solo (1985–2024) via MapBiomas Collection. ' +
      'Detecta conversões de vegetação nativa para uso antrópico e verifica o corte temporal ' +
      'do Código Florestal (Lei 12.651/2012).',
    priority: 6,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 7, // 7 days (annual data, updates once a year)
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

  // --- Check by GPS coordinates ---

  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) throw new Error('Coordinates required');
    const { lat, lon } = input.coordinates;

    const history = await this.fetchPixelHistory(lat, lon);

    if (!history || history.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No land use history available for these coordinates (outside MapBiomas coverage)',
        details: { coordinates: { lat, lon } },
        executionTimeMs: 0,
        cached: false
      };
    }

    return this.analyzeHistory(history, { lat, lon }, null);
  }

  // --- Check by CAR number ---

  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;

    // Get centroid of CAR from database
    const rows = await db.execute<{ lat: number; lon: number; area_ha: number | null; status: string | null }>(sql`
      SELECT
        ST_Y(ST_Centroid(geometry)) AS lat,
        ST_X(ST_Centroid(geometry)) AS lon,
        area_ha,
        status
      FROM car_registrations
      WHERE car_number = ${carCode}
      LIMIT 1
    `);

    const car = rows.rows?.[0];

    if (!car || car.lat == null || car.lon == null) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: `CAR ${carCode} not found in local database — cannot determine coordinates for land use lookup`,
        details: { car_number: carCode },
        executionTimeMs: 0,
        cached: false
      };
    }

    const history = await this.fetchPixelHistory(car.lat, car.lon);

    if (!history || history.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No land use history available for this CAR location (outside MapBiomas coverage)',
        details: { car_number: carCode, lat: car.lat, lon: car.lon },
        executionTimeMs: 0,
        cached: false
      };
    }

    return this.analyzeHistory(history, { lat: car.lat, lon: car.lon }, carCode);
  }

  // --- Fetch pixel history from MapBiomas Collection REST API ---

  private async fetchPixelHistory(lat: number, lon: number): Promise<PixelYear[] | null> {
    const url = new URL(`${COLLECTION_API_BASE}/maps/pixel-history`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('subthemeKey', 'coverage_lclu');
    url.searchParams.set('legendKey', 'default');

    logger.debug({ lat, lon, url: url.toString() }, 'MapBiomas Collection pixel-history request');

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.3' },
      signal: AbortSignal.timeout(this.config.timeout ?? 15000)
    });

    if (!response.ok) {
      logger.warn({ status: response.status, lat, lon }, 'MapBiomas Collection pixel-history failed');
      return null;
    }

    const data = await response.json() as { history?: PixelYear[] };
    return data.history ?? null;
  }

  // --- Analyze land use history and produce checker result ---

  private analyzeHistory(
    history: PixelYear[],
    location: { lat: number; lon: number },
    carCode: string | null
  ): CheckerResult {
    const sorted = [...history].sort((a, b) => a.year - b.year);

    const currentYear = sorted[sorted.length - 1];
    const currentClass = currentYear?.pixelValue ?? 0;
    const isCurrentlyNative = NATIVE_CLASSES.has(currentClass);
    const isCurrentlyAnthropic = ANTHROPIC_CLASSES.has(currentClass);

    // Find first conversion from native to anthropic
    let firstConversionYear: number | null = null;
    let conversionFromClass: number | null = null;
    let conversionToClass: number | null = null;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (NATIVE_CLASSES.has(prev.pixelValue) && ANTHROPIC_CLASSES.has(curr.pixelValue)) {
        firstConversionYear = curr.year;
        conversionFromClass = prev.pixelValue;
        conversionToClass = curr.pixelValue;
        break;
      }
    }

    // Classify years
    const nativeYears = sorted.filter(y => NATIVE_CLASSES.has(y.pixelValue)).map(y => y.year);
    const anthropicYears = sorted.filter(y => ANTHROPIC_CLASSES.has(y.pixelValue)).map(y => y.year);
    const recentYears = sorted.filter(y => y.year >= 2019);
    const recentAnthropicYears = recentYears.filter(y => ANTHROPIC_CLASSES.has(y.pixelValue));

    // Summarize trajectory (deduplicated class sequence)
    const trajectory: Array<{ class: string; from_year: number; to_year: number }> = [];
    let segStart = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const curr = sorted[i];
      if (!curr || curr.pixelValue !== sorted[i - 1].pixelValue) {
        trajectory.push({
          class: CLASS_NAMES[sorted[i - 1].pixelValue] ?? `Class ${sorted[i - 1].pixelValue}`,
          from_year: segStart.year,
          to_year: sorted[i - 1].year
        });
        if (curr) segStart = curr;
      }
    }

    const evidence = {
      dataSource: 'MapBiomas Collection — Land Cover LULC Annual Map (1985–2024)',
      url: `https://plataforma.mapbiomas.org/map#coverage`,
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      current_land_use:       CLASS_NAMES[currentClass] ?? `Class ${currentClass}`,
      current_land_use_class: currentClass,
      current_year:           currentYear?.year,
      first_conversion_year:  firstConversionYear,
      converted_from:         conversionFromClass != null ? (CLASS_NAMES[conversionFromClass] ?? `Class ${conversionFromClass}`) : null,
      converted_to:           conversionToClass != null ? (CLASS_NAMES[conversionToClass] ?? `Class ${conversionToClass}`) : null,
      native_years_count:     nativeYears.length,
      anthropic_years_count:  anthropicYears.length,
      data_range:             `${sorted[0]?.year}–${currentYear?.year}`,
      trajectory,
      codigo_florestal_cutoff: CODIGO_FLORESTAL_YEAR,
      methodology:
        'Pixel-level land cover classification from MapBiomas Collection (Landsat 30m, annual). ' +
        'Conversion = first year when land class changed from NATIVE to ANTHROPIC.'
    };

    // CRITICAL: recent conversion (2020+) of native vegetation
    if (firstConversionYear != null && firstConversionYear > RECENT_CONVERSION_YEAR) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.CRITICAL,
        message:
          `CRITICAL: Native vegetation converted to ${CLASS_NAMES[conversionToClass!] ?? 'anthropic use'} ` +
          `in ${firstConversionYear} (post-2019). Direct violation of Código Florestal.`,
        details: {
          ...baseDetails,
          recommendation:
            'Conversion of native vegetation after 2019 violates Lei 12.651/2012. ' +
            'Restoration obligation applies. Cross-check with IBAMA embargoes and PRODES/DETER alerts.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // FAIL: conversion after Código Florestal (2013–2019)
    if (firstConversionYear != null && firstConversionYear > CODIGO_FLORESTAL_YEAR) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Native vegetation converted in ${firstConversionYear} (post-2012 Código Florestal cutoff). ` +
          `From: ${CLASS_NAMES[conversionFromClass!] ?? '?'} → ${CLASS_NAMES[conversionToClass!] ?? 'anthropic'}`,
        details: {
          ...baseDetails,
          recommendation:
            'Conversion occurred after the Código Florestal (Lei 12.651/2012) cutoff date. ' +
            'Property may be required to restore converted areas. Verify CAR compliance and RL declaration.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: conversion before Código Florestal (possible amnesty)
    if (firstConversionYear != null && firstConversionYear <= CODIGO_FLORESTAL_YEAR) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Native vegetation converted in ${firstConversionYear} (before 2012 cutoff). ` +
          `Possible amnesty under Código Florestal for pre-2008 conversions.`,
        details: {
          ...baseDetails,
          recommendation:
            'Conversion predates the Código Florestal cutoff. Pre-2008 conversions may be eligible ' +
            'for the rural amnesty program (PRA). Verify CAR enrollment and Reserva Legal compliance.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: always anthropic (no native history found)
    if (!isCurrentlyNative && nativeYears.length === 0) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `No native vegetation detected in 40-year history. ` +
          `Current use: ${CLASS_NAMES[currentClass] ?? `Class ${currentClass}`} (since ${sorted[0]?.year}).`,
        details: {
          ...baseDetails,
          recommendation:
            'This area has been under anthropic use throughout the MapBiomas record (1985+). ' +
            'Conversion likely predates satellite monitoring. Verify Reserva Legal compliance in SICAR.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: currently native vegetation, no recent conversion
    return {
      status: CheckStatus.PASS,
      message:
        `Native vegetation maintained. Current: ${CLASS_NAMES[currentClass] ?? `Class ${currentClass}`}. ` +
        `${nativeYears.length} of ${sorted.length} years classified as native.`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new LandUseHistoryChecker();
