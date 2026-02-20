/**
 * NDVI Productivity Checker
 *
 * Consulta séries temporais de NDVI (Normalized Difference Vegetation Index)
 * via NASA APPEEARS API (gratuito). Detecta degradação de pastagem, abandono
 * de área e queda de produtividade vegetal.
 *
 * Data source: NASA MODIS MOD13Q1 v6.1 (NDVI, 250m, 16 dias)
 * API: https://appeears.earthdatacloud.nasa.gov/api/
 * Auth: NASA Earthdata token (gratuito — urs.earthdata.nasa.gov)
 * Env var: NASA_EARTHDATA_TOKEN
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
// NDVI is scaled 0–1 in these thresholds (raw NASA values are -2000 to 10000, multiply by 0.0001)
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

// --- APPEEARS API types ---

interface AppeearsToken {
  token: string;
  expiration: string;
}

interface AppeearsPointRequest {
  task_name: string;
  task_type: 'point';
  startDate: string;   // MM-DD-YYYY
  endDate: string;
  recurring: boolean;
  layers: Array<{ product: string; layer: string }>;
  coordinates: Array<{ id: string; latitude: number; longitude: number; category?: string }>;
}

interface AppeearsResult {
  Date: string;             // YYYY-MM-DD
  MODIS_Grid_16DAY_250m_500m_VI_NDVI: number | null; // scaled -2000 to 10000
  Category?: string;
}

// --- Checker ---

export class NdviProductivityChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'NDVI Productivity (NASA MODIS)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Série temporal de NDVI via NASA APPEEARS/MODIS (250m, 16 dias). ' +
      'Detecta degradação de pastagem, queda de produtividade e abandono de área.',
    priority: 6,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 dias (MODIS atualiza a cada 16 dias)
    timeout: 30000,   // 30s — APPEEARS é assíncrono, pode demorar
    apiKey: process.env.NASA_EARTHDATA_TOKEN
  };

  // APPEEARS base URL
  private readonly baseUrl = 'https://appeears.earthdatacloud.nasa.gov/api';

  // --- Main entrypoint ---

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (!this.config.apiKey) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'NASA Earthdata token not configured (NASA_EARTHDATA_TOKEN)',
        details: {
          setup: 'docs/SATELLITE_IMAGERY_ROADMAP.md',
          registration: 'https://urs.earthdata.nasa.gov/users/new'
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    let lat: number;
    let lon: number;
    let locationMeta: Record<string, any> = {};

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

    logger.debug({ lat, lon }, 'Fetching NDVI time-series from NASA APPEEARS');

    // Calculate date range: last 3 years
    const endDate   = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 3);

    const formatDate = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

    const ndviSeries = await this.fetchNdviSeries(
      lat,
      lon,
      formatDate(startDate),
      formatDate(endDate)
    );

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

  // --- Authenticate with APPEEARS using NASA Earthdata JWT token ---
  // NASA Earthdata JWT is passed as Bearer to the APPEEARS /login endpoint
  // which returns an APPEEARS-specific session token.

  private async getAppeearsToken(): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: {
        // NASA Earthdata JWT used as Bearer (not Basic auth)
        Authorization: `Bearer ${this.config.apiKey}`
      }
    });

    if (!resp.ok) {
      throw new Error(`APPEEARS login failed: ${resp.status} ${await resp.text().catch(() => '')}`);
    }

    const data = (await resp.json()) as AppeearsToken;
    return data.token;
  }

  // --- Submit task and poll for results (synchronous approach via point endpoint) ---

  private async fetchNdviSeries(
    lat: number,
    lon: number,
    startDate: string,
    endDate: string
  ): Promise<{ date: string; ndvi: number }[]> {
    const token = await this.getAppeearsToken();

    // Submit a point task
    const taskPayload: AppeearsPointRequest = {
      task_name: `defarm-ndvi-${Date.now()}`,
      task_type: 'point',
      startDate,
      endDate,
      recurring: false,
      layers: [
        {
          product: 'MOD13Q1.061',        // MODIS Terra Vegetation Indices, 16-Day 250m
          layer: '_250m_16_days_NDVI'
        }
      ],
      coordinates: [
        {
          id: 'p1',
          latitude: lat,
          longitude: lon,
          category: 'defarm-check'
        }
      ]
    };

    const submitResp = await fetch(`${this.baseUrl}/task`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskPayload)
    });

    if (!submitResp.ok) {
      throw new Error(`APPEEARS task submission failed: ${submitResp.status}`);
    }

    const { task_id } = (await submitResp.json()) as { task_id: string };

    // Poll until done (max 25s, check every 3s)
    const maxWaitMs   = 25000;
    const pollMs      = 3000;
    const deadline    = Date.now() + maxWaitMs;
    let taskStatus    = 'processing';

    while (taskStatus !== 'done' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollMs));

      const statusResp = await fetch(`${this.baseUrl}/task/${task_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!statusResp.ok) break;

      const statusData = (await statusResp.json()) as { status: string };
      taskStatus = statusData.status;
    }

    if (taskStatus !== 'done') {
      throw new Error('APPEEARS task did not complete within timeout');
    }

    // Download results
    const resultsResp = await fetch(
      `${this.baseUrl}/bundle/${task_id}/MOD13Q1.061--_250m_16_days_NDVI-results`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!resultsResp.ok) {
      throw new Error(`APPEEARS results download failed: ${resultsResp.status}`);
    }

    const rawResults = (await resultsResp.json()) as AppeearsResult[];

    // Convert NDVI from scaled integer to float (scale factor 0.0001)
    return rawResults
      .filter(r => r.MODIS_Grid_16DAY_250m_500m_VI_NDVI !== null &&
                   r.MODIS_Grid_16DAY_250m_500m_VI_NDVI !== undefined &&
                   r.MODIS_Grid_16DAY_250m_500m_VI_NDVI > -3000) // -3000 = no data sentinel
      .map(r => ({
        date: r.Date,
        ndvi: (r.MODIS_Grid_16DAY_250m_500m_VI_NDVI as number) * 0.0001
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- Analyze NDVI series and build result ---

  private buildResult(
    series: { date: string; ndvi: number }[],
    location: Record<string, any>
  ): CheckerResult {
    if (series.length < 4) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Insufficient NDVI data for analysis (possible cloud cover or data gap)',
        details: { location, observations: series.length },
        evidence: {
          dataSource: 'NASA MODIS MOD13Q1 (250m, 16-day)',
          url: 'https://appeears.earthdatacloud.nasa.gov/'
        },
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

    const currentNdvi   = ndviValues[ndviValues.length - 1];
    const latestDate    = series[series.length - 1].date;
    const earliestDate  = series[0].date;

    // Classify current NDVI
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
      current_ndvi: parseFloat(currentNdvi.toFixed(3)),
      current_classification: currentClassification,
      trend: parseFloat(trend.toFixed(3)),
      trend_label: trendLabel,
      statistics: {
        mean:  parseFloat(mean.toFixed(3)),
        min:   parseFloat(min.toFixed(3)),
        max:   parseFloat(max.toFixed(3)),
        observations: series.length,
        period: `${earliestDate} to ${latestDate}`
      },
      time_series: series.map(s => ({
        date: s.date,
        ndvi: parseFloat(s.ndvi.toFixed(3))
      }))
    };

    const evidence = {
      dataSource: 'NASA MODIS MOD13Q1.061 (Terra, 250m, 16-day NDVI)',
      url: 'https://appeears.earthdatacloud.nasa.gov/',
      lastUpdate: latestDate
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
    if (
      currentNdvi < NDVI_THRESHOLDS.low_productivity ||
      trend < DEGRADATION_TREND_THRESHOLD
    ) {
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
