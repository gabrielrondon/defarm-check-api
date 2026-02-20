/**
 * NDVI Productivity Checker
 *
 * Consulta séries temporais de NDVI (Normalized Difference Vegetation Index)
 * via ORNL DAAC MODIS Subset API (gratuito, síncrono, sem autenticação).
 * Detecta degradação de pastagem, abandono de área e queda de produtividade.
 *
 * Data source: NASA MODIS MOD13Q1 v6.1 (NDVI, 250m, 16 dias)
 * API: https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset
 * Auth: None (public API)
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

// --- NDVI classification thresholds ---
// NDVI is scaled 0–1 in these thresholds
const NDVI_THRESHOLDS = {
  sparse_degraded:  0.2,  // < 0.2: bare soil / severely degraded
  low_productivity: 0.35, // 0.2–0.35: degraded pasture / sparse vegetation
  moderate:         0.5,  // 0.35–0.5: moderate productivity
  good:             0.65, // 0.5–0.65: good vegetation
  high:             1.0   // > 0.65: dense native vegetation / healthy crops
};

// Trend thresholds (change in NDVI mean between first and last half of series)
const DEGRADATION_TREND_THRESHOLD = -0.05; // -5 NDVI points = degrading
const RECOVERY_TREND_THRESHOLD    =  0.05; // +5 NDVI points = recovering

const ORNL_BASE_URL = 'https://modis.ornl.gov/rst/api/v1';
const MODIS_PRODUCT = 'MOD13Q1'; // Terra Vegetation Indices, 16-Day, 250m
const MODIS_BAND    = '250m_16_days_NDVI';
const SCALE_FACTOR  = 0.0001; // raw values × 0.0001 = NDVI (-1 to 1)

// --- ORNL DAAC API types ---

interface OrnlSubset {
  // nrows/ncols are top-level fields (not nested in header)
  nrows?: number;
  ncols?: number;
  subset?: Array<{
    calendar_date: string;
    data?: number[];
  }>;
}

/** Convert a JS Date to MODIS date format: A{year}{doy:03} */
function toModisDate(d: Date): string {
  const yearStart = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - yearStart.getTime()) / 86400000);
  return `A${d.getFullYear()}${String(doy).padStart(3, '0')}`;
}

// --- Checker ---

export class NdviProductivityChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'NDVI Productivity (NASA MODIS)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Série temporal de NDVI via ORNL DAAC/MODIS MOD13Q1 (250m, 16 dias). ' +
      'Detecta degradação de pastagem, queda de produtividade e abandono de área.',
    priority: 6,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 days (MODIS updates every 16 days)
    timeout: 45000     // 3 ORNL batches × up to 12s each
  };

  // --- Main entrypoint ---

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    let lat: number;
    let lon: number;
    let locationMeta: Record<string, unknown> = {};

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
    } else {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Input type not supported. Use COORDINATES or CAR.',
        executionTimeMs: 0,
        cached: false
      };
    }

    logger.debug({ lat, lon }, 'Fetching NDVI time-series from ORNL DAAC MODIS');

    const ndviSeries = await this.fetchNdviSeries(lat, lon);
    return this.buildResult(ndviSeries, locationMeta);
  }

  // --- Get CAR polygon centroid from DB ---

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

  // --- Fetch NDVI time-series from ORNL DAAC (synchronous, no auth) ---
  // ORNL DAAC limits: max 10 tiles per request for MOD13Q1 (16-day composites).
  // 10 tiles × 16 days = 160 days. We cover ~1 year using 3 batches.

  private async fetchNdviSeries(lat: number, lon: number): Promise<{ date: string; ndvi: number }[]> {
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

    const allSeries: Array<{ date: string; ndvi: number }> = [];

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
        if (!resp.ok) {
          logger.warn({ status: resp.status, lat, lon }, 'ORNL MODIS MOD13Q1 API error');
          continue;
        }

        const data    = (await resp.json()) as OrnlSubset;
        const subsets = data.subset ?? [];

        // With kmAboveBelow=0 & kmLeftRight=0, response is a 1×1 grid → pixel index 0
        for (const s of subsets) {
          const rawVal = s.data?.[0];
          if (rawVal == null || rawVal <= -3000) continue; // fill/no-data sentinel
          const ndvi = rawVal * SCALE_FACTOR;
          if (ndvi < -1 || ndvi > 1) continue; // out of valid range
          allSeries.push({ date: s.calendar_date, ndvi });
        }
      } catch {
        // Non-fatal: skip batch on timeout or network error
      }
    }

    // Deduplicate and sort by date
    const seen = new Set<string>();
    return allSeries
      .filter(s => !seen.has(s.date) && seen.add(s.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- Analyze NDVI series and build result ---

  private buildResult(
    series: { date: string; ndvi: number }[],
    location: Record<string, unknown>
  ): CheckerResult {
    const evidence = {
      dataSource: 'NASA MODIS MOD13Q1.061 (Terra, 250m, 16-day NDVI) via ORNL DAAC',
      url: 'https://modis.ornl.gov/',
      lastUpdate: series.length > 0 ? series[series.length - 1].date : new Date().toISOString().split('T')[0]
    };

    if (series.length < 4) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Insufficient NDVI data for analysis (possible cloud cover or data gap)',
        details: { location, observations: series.length },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    const ndviValues = series.map(s => s.ndvi);
    const mean   = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
    const min    = Math.min(...ndviValues);
    const max    = Math.max(...ndviValues);

    // Trend: compare first-half average vs. second-half average
    const mid        = Math.floor(series.length / 2);
    const firstHalf  = ndviValues.slice(0, mid);
    const secondHalf = ndviValues.slice(mid);
    const firstMean  = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const trend      = secondMean - firstMean; // positive = improving, negative = degrading

    const currentNdvi  = ndviValues[ndviValues.length - 1];
    const latestDate   = series[series.length - 1].date;
    const earliestDate = series[0].date;

    const classifyNdvi = (v: number): string => {
      if (v < NDVI_THRESHOLDS.sparse_degraded)  return 'Solo exposto / Degradação severa';
      if (v < NDVI_THRESHOLDS.low_productivity) return 'Pasto degradado / Vegetação esparsa';
      if (v < NDVI_THRESHOLDS.moderate)         return 'Produtividade moderada';
      if (v < NDVI_THRESHOLDS.good)             return 'Boa cobertura vegetal';
      return 'Vegetação densa / Alta produtividade';
    };

    const classifyTrend = (t: number): string => {
      if (t < DEGRADATION_TREND_THRESHOLD * 2) return 'Degradação acelerada';
      if (t < DEGRADATION_TREND_THRESHOLD)     return 'Tendência de degradação';
      if (t > RECOVERY_TREND_THRESHOLD * 2)    return 'Recuperação significativa';
      if (t > RECOVERY_TREND_THRESHOLD)        return 'Tendência de recuperação';
      return 'Estável';
    };

    const currentClassification = classifyNdvi(currentNdvi);
    const trendLabel            = classifyTrend(trend);

    const baseDetails = {
      location,
      current_ndvi:           parseFloat(currentNdvi.toFixed(3)),
      current_classification: currentClassification,
      trend:                  parseFloat(trend.toFixed(3)),
      trend_label:            trendLabel,
      statistics: {
        mean:         parseFloat(mean.toFixed(3)),
        min:          parseFloat(min.toFixed(3)),
        max:          parseFloat(max.toFixed(3)),
        observations: series.length,
        period:       `${earliestDate} to ${latestDate}`
      },
      time_series: series.map(s => ({
        date: s.date,
        ndvi: parseFloat(s.ndvi.toFixed(3))
      }))
    };

    // FAIL: severe degradation (low NDVI + declining trend)
    if (currentNdvi < NDVI_THRESHOLDS.sparse_degraded && trend < DEGRADATION_TREND_THRESHOLD) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message: `Severe vegetation degradation detected. NDVI=${currentNdvi.toFixed(3)} (${currentClassification}), trend: ${trendLabel}`,
        details: {
          ...baseDetails,
          recommendation: 'Significant vegetation loss detected. Verify land use, livestock density, and cross-check with IBAMA embargoes.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: degraded or declining
    if (currentNdvi < NDVI_THRESHOLDS.low_productivity || trend < DEGRADATION_TREND_THRESHOLD) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message: `Low/declining vegetation productivity. NDVI=${currentNdvi.toFixed(3)} (${currentClassification}), trend: ${trendLabel}`,
        details: {
          ...baseDetails,
          recommendation: 'Possible pasture degradation or seasonal stress. Monitor over next reporting period.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: acceptable NDVI
    return {
      status: CheckStatus.PASS,
      message: `Vegetation productivity acceptable. NDVI=${currentNdvi.toFixed(3)} (${currentClassification}), trend: ${trendLabel}`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new NdviProductivityChecker();
