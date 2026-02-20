/**
 * Soil Exposure & Erosion Risk Checker (Sentinel-2)
 *
 * Detecta solo exposto e risco de erosão via Bare Soil Index (BSI) e NDVI
 * usando Sentinel-2 L2A (10m resolução) através da Sentinel Hub Statistical API.
 *
 * BSI = ((B11 + B04) - (B08 + B02)) / ((B11 + B04) + (B08 + B02))
 *   - BSI > 0.1  → solo exposto confirmado
 *   - BSI > 0.0  → possível solo exposto / vegetação rala
 *   - BSI < -0.1 → vegetação densa
 *
 * Risco de erosão = f(BSI médio, frequência de solo exposto, declividade implícita)
 *
 * Critérios:
 *  - BSI médio > 0.15 por > 3 meses consecutivos  → FAIL/HIGH
 *  - BSI médio > 0.1  por > 2 meses               → FAIL/MEDIUM
 *  - BSI médio > 0.05 por qualquer mês             → WARNING
 *  - BSI < 0.05 consistentemente                  → PASS
 *
 * Requer: SENTINEL_HUB_CLIENT_ID + SENTINEL_HUB_CLIENT_SECRET
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
import {
  sentinelHubConfigured,
  sentinelHubStats,
  pointToPolygon,
  extractMeanSeries,
  geometryExceedsSentinelLimit,
  SHGeometry
} from '../../services/sentinel-hub-auth.js';

// BSI evalscript for Sentinel-2 L2A
const BSI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02","B04","B08","B11"], units: "REFLECTANCE" }],
    output: [{ id: "bsi", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  const bsi = ((s.B11 + s.B04) - (s.B08 + s.B02)) /
              ((s.B11 + s.B04) + (s.B08 + s.B02) + 0.0001);
  return [bsi];
}`;

export class SoilErosionRiskChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Soil Exposure & Erosion Risk (Sentinel-2)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Detecta solo exposto e risco de erosão via Bare Soil Index (BSI) usando ' +
      'Sentinel-2 L2A (10m, resolução alta). Identifica áreas vulneráveis à erosão ' +
      'por exposição prolongada do solo.',
    priority: 5,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 30, // 30 days
    timeout: 45000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (!sentinelHubConfigured()) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Sentinel Hub credentials not configured (SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET)',
        details: { setup: 'docs/SATELLITE_IMAGERY_ROADMAP.md' },
        executionTimeMs: 0,
        cached: false
      };
    }

    const { geometry, locationLabel } = await this.resolveGeometry(input);
    if (!geometry) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: input.type === InputType.CAR
          ? `CAR ${input.value} not found in local database`
          : 'Could not resolve geometry',
        details: { input: input.value },
        executionTimeMs: 0,
        cached: false
      };
    }

    const now       = new Date();
    const fromDate  = new Date(now); fromDate.setFullYear(now.getFullYear() - 1);
    const toDate    = now;

    logger.debug({ checker: this.metadata.name, input: input.value }, 'Calling Sentinel Hub BSI');

    const response = await sentinelHubStats({
      geometry,
      dataType:     'sentinel-2-l2a',
      fromDate:     fromDate.toISOString(),
      toDate:       toDate.toISOString(),
      intervalDays: 30,
      evalscript:   BSI_EVALSCRIPT,
      outputId:     'bsi',
      maxCloudCover: 30
    });

    const series = extractMeanSeries(response, 'bsi', 'B0');
    return this.analyzeBSI(series, locationLabel, input);
  }

  private analyzeBSI(
    series: Array<{ date: string; mean: number }>,
    label: string,
    input: NormalizedInput
  ): CheckerResult {
    if (series.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No valid Sentinel-2 observations available (cloud cover or no data)',
        details: { input: input.value, location: label },
        executionTimeMs: 0,
        cached: false
      };
    }

    const bsiValues  = series.map(s => s.mean);
    const meanBSI    = bsiValues.reduce((a, b) => a + b, 0) / bsiValues.length;
    const maxBSI     = Math.max(...bsiValues);
    const exposedMonths = series.filter(s => s.mean > 0.05).length;
    const highExposedMonths = series.filter(s => s.mean > 0.1).length;

    // Detect consecutive months of high exposure
    let maxConsecutiveHigh = 0, consecutiveHigh = 0;
    for (const s of series) {
      if (s.mean > 0.1) { consecutiveHigh++; maxConsecutiveHigh = Math.max(maxConsecutiveHigh, consecutiveHigh); }
      else consecutiveHigh = 0;
    }

    const evidence = {
      dataSource: 'Sentinel-2 L2A — Bare Soil Index (BSI) via Sentinel Hub Statistical API (10m)',
      url: 'https://www.sentinel-hub.com/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(input.type === InputType.CAR ? { car_number: input.value } : { coordinates: label }),
      mean_bsi:              parseFloat(meanBSI.toFixed(4)),
      max_bsi:               parseFloat(maxBSI.toFixed(4)),
      exposed_months:        exposedMonths,
      high_exposure_months:  highExposedMonths,
      max_consecutive_high:  maxConsecutiveHigh,
      total_months_analyzed: series.length,
      bsi_time_series:       series,
      bsi_interpretation: {
        '>0.15': 'Confirmed bare soil / severe exposure',
        '0.05–0.15': 'Possible bare soil / sparse vegetation',
        '<0.05': 'Vegetated / low erosion risk'
      }
    };

    if (maxConsecutiveHigh >= 3 || meanBSI > 0.15) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `High erosion risk: mean BSI ${meanBSI.toFixed(3)}, ` +
          `${highExposedMonths} months with bare soil, ` +
          `${maxConsecutiveHigh} consecutive months of high exposure.`,
        details: {
          ...baseDetails,
          recommendation:
            'Prolonged soil exposure detected. Severe erosion risk. Implement cover crops, ' +
            'no-till practices or riparian buffers. Cross-check with Código Florestal APP compliance.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (highExposedMonths >= 2 || meanBSI > 0.10) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.MEDIUM,
        message:
          `Moderate erosion risk: mean BSI ${meanBSI.toFixed(3)}, ` +
          `${highExposedMonths} months with significant bare soil exposure.`,
        details: {
          ...baseDetails,
          recommendation:
            'Bare soil detected for multiple months. Erosion risk is significant. ' +
            'Consider soil conservation practices and vegetation cover management.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (exposedMonths >= 1 || meanBSI > 0.05) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Low-moderate erosion risk: ${exposedMonths} month(s) with some bare soil detected (BSI ${meanBSI.toFixed(3)}).`,
        details: baseDetails,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message: `Low erosion risk: consistent vegetation cover detected (mean BSI ${meanBSI.toFixed(3)}).`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  private async resolveGeometry(input: NormalizedInput): Promise<{ geometry: SHGeometry | null; locationLabel: string }> {
    if (input.type === InputType.COORDINATES && input.coordinates) {
      const { lat, lon } = input.coordinates;
      return { geometry: pointToPolygon(lat, lon), locationLabel: `${lat},${lon}` };
    }

    if (input.type === InputType.CAR) {
      const rows = await db.execute<{ geojson: string; lat: number; lon: number }>(sql`
        SELECT ST_AsGeoJSON(ST_Simplify(geometry, 0.001)) AS geojson,
               ST_Y(ST_Centroid(geometry)) AS lat,
               ST_X(ST_Centroid(geometry)) AS lon
        FROM car_registrations WHERE car_number = ${input.value} LIMIT 1
      `);
      const row = rows.rows?.[0];
      if (!row?.geojson) return { geometry: null, locationLabel: input.value };
      let geometry = JSON.parse(row.geojson) as SHGeometry;
      // Fall back to centroid bbox if polygon is too large for Sentinel Hub (>~55km)
      if (geometryExceedsSentinelLimit(geometry)) {
        geometry = pointToPolygon(row.lat, row.lon);
      }
      return {
        geometry,
        locationLabel: `CAR ${input.value} (${row.lat?.toFixed(4)},${row.lon?.toFixed(4)})`
      };
    }

    return { geometry: null, locationLabel: input.value };
  }
}

export default new SoilErosionRiskChecker();
