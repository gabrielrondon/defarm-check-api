/**
 * Pasture Degradation Checker
 *
 * Detecta degradação de pastagem combinando duas fontes:
 *
 * 1. MODIS NDVI via ORNL DAAC Subset API (gratuito, síncrono, sem auth)
 *    - Produto: MOD13Q1 v6.1 (Terra NDVI, 250m, 16 dias)
 *    - Endpoint: https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset
 *    - Retorna NDVI atual + tendência (3 anos)
 *
 * 2. Focos de queimadas do banco (últimos 90 dias)
 *    - Cruza geometria CAR ou buffer de coordenadas com queimadas_focos
 *    - Incêndios recentes indicam degradação de pastagem
 *
 * Diferencial vs NdviProductivityChecker:
 *    - Usa API síncrona (resposta em 1-2s, não async de 25s)
 *    - Foca especificamente em pastagem (thresholds bioma-específicos)
 *    - Incorpora dados de fogo do nosso banco
 *    - Calcula Pasture Quality Index (PQI) composto
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

// --- ORNL DAAC MODIS Subset API ---
const ORNL_BASE_URL = 'https://modis.ornl.gov/rst/api/v1';
const MODIS_PRODUCT = 'MOD13Q1'; // Terra Vegetation Indices, 16-Day, 250m
const MODIS_BAND    = '250m_16_days_NDVI';
const SCALE_FACTOR  = 0.0001; // raw values × 0.0001 = NDVI (-1 to 1)

// --- Biome-specific NDVI pasture benchmarks ---
// Healthy native pasture / good managed pasture ranges by biome
const BIOME_NDVI_BENCHMARKS: Record<string, { healthy: number; moderate: number; degraded: number }> = {
  // Amazon: dense vegetation expected, low NDVI = severe problem
  amazon:    { healthy: 0.75, moderate: 0.55, degraded: 0.35 },
  // Cerrado: naturally lower NDVI due to savanna structure
  cerrado:   { healthy: 0.55, moderate: 0.38, degraded: 0.22 },
  // Caatinga: very seasonal, low NDVI dry season is normal
  caatinga:  { healthy: 0.45, moderate: 0.28, degraded: 0.15 },
  // Mata Atlântica: dense, similar to Amazon
  mata_atlantica: { healthy: 0.70, moderate: 0.50, degraded: 0.30 },
  // Pampa: grassland dominant, moderate NDVI
  pampa:     { healthy: 0.55, moderate: 0.38, degraded: 0.22 },
  // Pantanal: highly seasonal, use middle benchmarks
  pantanal:  { healthy: 0.60, moderate: 0.42, degraded: 0.25 },
  // Default (unknown biome)
  default:   { healthy: 0.55, moderate: 0.38, degraded: 0.22 }
};

// --- API response types ---
// Note: ORNL DAAC returns nrows/ncols at top-level, not inside a nested header
interface OrnlSubset {
  nrows?: number;
  ncols?: number;
  subset: Array<{
    modis_date: string;   // "A2024001" (year + day of year)
    calendar_date: string; // "2024-01-01"
    band: string;
    tile: string;
    proc_date: string;
    data: number[];       // pixel values (scaled)
  }>;
  xllcorner: number;
  yllcorner: number;
}

// --- Checker ---

/** Convert a JS Date to MODIS date format: A{year}{doy:03} */
function toModisDate(d: Date): string {
  const yearStart = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - yearStart.getTime()) / 86400000);
  return `A${d.getFullYear()}${String(doy).padStart(3, '0')}`;
}

export class PastureDegradationChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Pasture Degradation Index (MODIS)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Detecta degradação de pastagem combinando NDVI via ORNL DAAC (MODIS MOD13Q1, 250m, síncrono) ' +
      'com dados de focos de queimadas do banco (últimos 90 dias). ' +
      'Calcula Pasture Quality Index (PQI) com benchmarks específicos por bioma.',
    priority: 5,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR],
    supportedCountries: [Country.BRAZIL, Country.URUGUAY, Country.ARGENTINA, Country.PARAGUAY, Country.BOLIVIA, Country.CHILE, Country.COLOMBIA, Country.PERU] // Global MODIS data
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800,  // 7 dias
    timeout: 45000     // 3 ORNL batches × up to 12s each
  };

  // --- Main entrypoint ---

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    let lat: number;
    let lon: number;
    let locationMeta: Record<string, any> = {};
    let carPolygonAvailable = false;

    if (input.type === InputType.COORDINATES) {
      if (!input.coordinates) throw new Error('Coordinates required');
      lat = input.coordinates.lat;
      lon = input.coordinates.lon;
      locationMeta = { lat, lon };
    } else if (input.type === InputType.CAR) {
      const centroid = await this.getCARCentroid(input.value);
      if (!centroid) {
        return {
          status: CheckStatus.NOT_APPLICABLE,
          message: `CAR ${input.value} not found in database`,
          details: { car_number: input.value },
          executionTimeMs: 0,
          cached: false
        };
      }
      lat = centroid.lat;
      lon = centroid.lon;
      locationMeta = { lat, lon, car_number: input.value };
      carPolygonAvailable = true;
    } else {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Input type not supported. Use COORDINATES or CAR.',
        executionTimeMs: 0,
        cached: false
      };
    }

    logger.debug({ lat, lon }, 'Checking pasture degradation via MODIS + queimadas');

    // Fetch NDVI time-series and fire counts in parallel
    const [ndviResult, fireCount] = await Promise.all([
      this.fetchModisNdvi(lat, lon),
      input.type === InputType.CAR
        ? this.countFiresInCAR(input.value)
        : this.countFiresNearCoords(lat, lon, 5000)  // 5km buffer
    ]);

    return this.buildResult(ndviResult, fireCount, locationMeta);
  }

  // --- CAR centroid from DB ---

  private async getCARCentroid(carNumber: string): Promise<{ lat: number; lon: number } | null> {
    const result = await db.execute<{ lat: number; lon: number }>(sql`
      SELECT
        ST_Y(ST_Centroid(geometry)) AS lat,
        ST_X(ST_Centroid(geometry)) AS lon
      FROM car_registrations
      WHERE car_number = ${carNumber}
      LIMIT 1
    `);
    return result.rows?.[0] ?? null;
  }

  // --- Count fire hotspots within CAR polygon (last 90 days) ---

  private async countFiresInCAR(carNumber: string): Promise<number> {
    try {
      const result = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*) AS count
        FROM queimadas_focos qf
        JOIN car_registrations cr ON cr.car_number = ${carNumber}
        WHERE ST_Within(
          ST_SetSRID(ST_MakePoint(qf.longitude, qf.latitude), 4326),
          cr.geometry
        )
        AND qf.data_hora_gmt >= NOW() - INTERVAL '90 days'
      `);
      return Number(result.rows?.[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  // --- Count fire hotspots near coordinates (buffer in meters) ---

  private async countFiresNearCoords(lat: number, lon: number, radiusM: number): Promise<number> {
    try {
      const result = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*) AS count
        FROM queimadas_focos
        WHERE ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusM}
        )
        AND data_hora_gmt >= NOW() - INTERVAL '90 days'
      `);
      return Number(result.rows?.[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  // --- Fetch NDVI time-series from ORNL DAAC MODIS Subset API (synchronous, no auth) ---
  // ORNL DAAC limits: max 10 tiles per request for MOD13Q1 (16-day composites).
  // 10 tiles × 16 days = 160 days. We cover ~1 year using up to 3 batches.

  private async fetchModisNdvi(lat: number, lon: number): Promise<{
    current: number | null;
    mean: number | null;
    min: number | null;
    trend: number | null;
    observations: number;
    latestDate: string | null;
    series: Array<{ date: string; ndvi: number }>;
  }> {
    const now        = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    // Build non-overlapping 160-day windows from oldest to newest
    const BATCH_DAYS = 160;
    const batches: Array<{ start: Date; end: Date }> = [];
    let windowEnd = new Date(now);

    while (windowEnd > oneYearAgo) {
      const windowStart = new Date(windowEnd);
      windowStart.setDate(windowStart.getDate() - BATCH_DAYS);
      if (windowStart < oneYearAgo) windowStart.setTime(oneYearAgo.getTime());
      batches.unshift({ start: windowStart, end: new Date(windowEnd) });
      windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() - 1);
    }

    const allSubsets: Array<{ calendar_date: string; data?: number[] }> = [];

    for (const batch of batches) {
      const url = new URL(`${ORNL_BASE_URL}/${MODIS_PRODUCT}/subset`);
      url.searchParams.set('latitude',     String(lat));
      url.searchParams.set('longitude',    String(lon));
      url.searchParams.set('startDate',    toModisDate(batch.start));
      url.searchParams.set('endDate',      toModisDate(batch.end));
      url.searchParams.set('kmAboveBelow', '0');
      url.searchParams.set('kmLeftRight',  '0');
      url.searchParams.set('band',         MODIS_BAND);

      try {
        const resp = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
          signal:  AbortSignal.timeout(12000)
        });
        if (resp.ok) {
          const data = (await resp.json()) as OrnlSubset;
          allSubsets.push(...(data.subset ?? []));
        } else {
          logger.warn({ status: resp.status, lat, lon }, 'ORNL MODIS API error');
        }
      } catch {
        // Non-fatal: skip batch on timeout or network error
      }
    }

    const subsets = allSubsets;

    // With kmAboveBelow=0 & kmLeftRight=0, 1×1 grid → pixel index 0
    const centerIdx = 0;

    const series: Array<{ date: string; ndvi: number }> = [];

    for (const s of subsets) {
      const rawVal = s.data?.[centerIdx];
      if (rawVal == null || rawVal <= -3000) continue; // fill/no-data sentinel

      const ndvi = rawVal * SCALE_FACTOR;
      if (ndvi < -1 || ndvi > 1) continue; // out of valid range

      series.push({ date: s.calendar_date, ndvi });
    }

    if (series.length === 0) {
      return { current: null, mean: null, min: null, trend: null, observations: 0, latestDate: null, series: [] };
    }

    series.sort((a, b) => a.date.localeCompare(b.date));

    const values = series.map(s => s.ndvi);
    const mean   = values.reduce((a, b) => a + b, 0) / values.length;
    const min    = Math.min(...values);
    const current = values[values.length - 1];

    // Trend: compare first-half vs second-half mean
    const mid      = Math.floor(values.length / 2);
    const firstMean = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const lastMean  = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);
    const trend = lastMean - firstMean;

    return {
      current,
      mean: parseFloat(mean.toFixed(3)),
      min:  parseFloat(min.toFixed(3)),
      trend: parseFloat(trend.toFixed(3)),
      observations: series.length,
      latestDate: series[series.length - 1].date,
      series
    };
  }

  // --- Detect biome from coordinates (simplified lat/lon heuristics for Brazil) ---

  private detectBiome(lat: number, lon: number): string {
    // Very rough biome detection from coordinates (Brazil only)
    // In production, this should query our terras_indigenas/unidades_conservacao for biome
    if (lat > -4 && lon < -50)                     return 'amazon';    // Northern Amazônia
    if (lat > -12 && lon < -44)                    return 'amazon';    // Amazon basin
    if (lat < -28 && lat > -34 && lon > -58)       return 'pampa';     // Rio Grande do Sul plains
    if (lat < -16 && lat > -20 && lon > -50 && lon < -44) return 'pantanal';
    if (lat > -12 && lon > -44 && lon < -35)       return 'caatinga';  // Northeast
    if (lat < -22 && lon > -53)                    return 'mata_atlantica';
    if (lat < -8 && lat > -22 && lon > -53 && lon < -43) return 'cerrado';
    return 'default';
  }

  // --- Build final result ---

  private buildResult(
    ndvi: {
      current: number | null;
      mean: number | null;
      min: number | null;
      trend: number | null;
      observations: number;
      latestDate: string | null;
      series: Array<{ date: string; ndvi: number }>;
    },
    fireCount: number,
    location: Record<string, any>
  ): CheckerResult {
    // If no NDVI data, base decision only on fire data
    if (ndvi.observations === 0) {
      const evidence = {
        dataSource: 'ORNL DAAC MODIS MOD13Q1 (250m, 16-day) + INPE Queimadas',
        url: 'https://modis.ornl.gov/',
        lastUpdate: new Date().toISOString().split('T')[0]
      };

      if (fireCount > 5) {
        return {
          status: CheckStatus.WARNING,
          severity: Severity.MEDIUM,
          message: `${fireCount} fire hotspot(s) detected in last 90 days. NDVI data unavailable (possible cloud cover).`,
          details: { location, fire_hotspots_90d: fireCount },
          evidence,
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'NDVI data not available for this location (possible cloud cover, ocean, or outside Brazil)',
        details: { location, fire_hotspots_90d: fireCount },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    const biome = this.detectBiome(
      typeof location.lat === 'number' ? location.lat : 0,
      typeof location.lon === 'number' ? location.lon : 0
    );
    const benchmarks = BIOME_NDVI_BENCHMARKS[biome] ?? BIOME_NDVI_BENCHMARKS.default;

    const currentNdvi  = ndvi.current!;
    const trendLabel   = ndvi.trend! < -0.05 ? 'Declining' : ndvi.trend! > 0.05 ? 'Recovering' : 'Stable';

    // Pasture Quality Index (PQI) — 0 to 100
    // Components: current NDVI vs biome benchmark + trend bonus/penalty + fire penalty
    const ndviScore    = Math.max(0, Math.min(100, ((currentNdvi - benchmarks.degraded) / (benchmarks.healthy - benchmarks.degraded)) * 100));
    const trendBonus   = ndvi.trend! > 0.05 ? 10 : ndvi.trend! < -0.05 ? -15 : 0;
    const firePenalty  = Math.min(30, fireCount * 3);
    const pqi          = Math.round(Math.max(0, Math.min(100, ndviScore + trendBonus - firePenalty)));

    const evidence = {
      dataSource: 'ORNL DAAC MODIS MOD13Q1 v6.1 (250m, 16-day) + INPE Queimadas',
      url: 'https://modis.ornl.gov/data/api/',
      lastUpdate: ndvi.latestDate ?? new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      location,
      biome,
      pasture_quality_index: pqi,
      ndvi: {
        current:      parseFloat(currentNdvi.toFixed(3)),
        mean_3y:      ndvi.mean,
        min_3y:       ndvi.min,
        trend:        ndvi.trend,
        trend_label:  trendLabel,
        observations: ndvi.observations,
        latest_date:  ndvi.latestDate
      },
      biome_benchmarks: {
        healthy:  benchmarks.healthy,
        moderate: benchmarks.moderate,
        degraded: benchmarks.degraded
      },
      fire_hotspots_90d: fireCount,
      time_series: ndvi.series.slice(-12)  // last 12 observations (~6 months)
    };

    // FAIL: severely degraded (below biome degraded threshold OR many fires + declining)
    if (currentNdvi < benchmarks.degraded || (fireCount >= 10 && ndvi.trend! < -0.03)) {
      return {
        status: CheckStatus.FAIL,
        severity: currentNdvi < benchmarks.degraded * 0.7 ? Severity.HIGH : Severity.MEDIUM,
        message:
          `Pasture degradation detected. PQI=${pqi}/100, NDVI=${currentNdvi.toFixed(3)} ` +
          `(biome threshold: ${benchmarks.degraded}), ${fireCount} fires in 90d, trend: ${trendLabel}`,
        details: {
          ...baseDetails,
          recommendation:
            'Significant pasture degradation indicators detected. ' +
            'Consider: soil analysis, stocking rate review, rotational grazing, pasture recovery plan. ' +
            'High fire count may indicate illegal burning for land clearing.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: moderate degradation or many fires
    if (currentNdvi < benchmarks.moderate || ndvi.trend! < -0.05 || fireCount >= 5) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Moderate pasture stress indicators. PQI=${pqi}/100, NDVI=${currentNdvi.toFixed(3)}, ` +
          `trend: ${trendLabel}, ${fireCount} fires in 90d`,
        details: {
          ...baseDetails,
          recommendation:
            'Monitor pasture quality. Declining NDVI or fire events may indicate overgrazing or ' +
            'inadequate pasture management. Cross-check with livestock density (DICOSE/GTA).'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: healthy pasture
    return {
      status: CheckStatus.PASS,
      message:
        `Pasture quality adequate. PQI=${pqi}/100, NDVI=${currentNdvi.toFixed(3)} ` +
        `(above ${biome} benchmark of ${benchmarks.moderate}), trend: ${trendLabel}`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new PastureDegradationChecker();
