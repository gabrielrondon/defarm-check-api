/**
 * Irrigation Detection Checker (Sentinel-2)
 *
 * Detecta padrões de irrigação usando NDMI (Normalized Difference Moisture Index)
 * e NDWI via Sentinel-2 L2A (10m) através da Sentinel Hub Statistical API.
 * Cruza com outorgas ANA já no banco — se irrigação detectada sem outorga → FAIL.
 *
 * NDMI = (B08 - B11) / (B08 + B11)
 *   - NDMI > 0.2 durante estação seca → vegetação com alto conteúdo de água → irrigação
 *
 * Lógica:
 *  - NDMI acima de 0.2 nos meses de seca (Abr-Set) + sem outorga ANA → FAIL/HIGH
 *  - NDMI acima de 0.2 na seca + com outorga ANA → PASS (irrigação autorizada)
 *  - NDMI elevado só na estação chuvosa → comportamento normal, PASS
 *
 * Meses de seca para cada região brasileira:
 *  - Cerrado/Amazônia: Maio-Setembro
 *  - Nordeste/Caatinga: Janeiro-Março + Julho-Novembro
 *  - Sul/Mata Atlântica: Junho-Agosto (inverno seco)
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

// NDMI evalscript for Sentinel-2 L2A
const NDMI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08","B11"], units: "REFLECTANCE" }],
    output: [{ id: "ndmi", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  const ndmi = (s.B08 - s.B11) / (s.B08 + s.B11 + 0.0001);
  return [ndmi];
}`;

// Dry season months (1-indexed) per biome approximation
function getDrySeasonMonths(lat: number, lon: number): number[] {
  if (lat > -15 && lat < 5) return [5, 6, 7, 8, 9];       // Amazônia/Cerrado Norte
  if (lat >= -15 && lat < -10 && lon > -46) return [6, 7, 8, 9, 10, 11]; // Nordeste interior
  if (lat < -25) return [6, 7, 8];                          // Sul (inverno seco)
  return [5, 6, 7, 8, 9];                                   // Cerrado (default)
}

export class IrrigationDetectionChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Irrigation Detection (Sentinel-2 NDMI)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Detecta irrigação via NDMI (Normalized Difference Moisture Index) Sentinel-2 (10m). ' +
      'Cruza com outorgas ANA do banco — irrigação sem outorga é sinalizada como FAIL.',
    priority: 6,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 30,
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

    const { geometry, locationLabel, lat, lon } = await this.resolveGeometry(input);
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

    const now      = new Date();
    const fromDate = new Date(now); fromDate.setFullYear(now.getFullYear() - 1);

    logger.debug({ checker: this.metadata.name, input: input.value }, 'Calling Sentinel Hub NDMI');

    // Fetch NDMI and check ANA outorgas in parallel
    const [response, hasAnaOutorga] = await Promise.all([
      sentinelHubStats({
        geometry,
        dataType:     'sentinel-2-l2a',
        fromDate:     fromDate.toISOString(),
        toDate:       now.toISOString(),
        intervalDays: 30,
        evalscript:   NDMI_EVALSCRIPT,
        outputId:     'ndmi',
        maxCloudCover: 30
      }),
      this.checkAnaOutorgas(lat, lon, input)
    ]);

    const series     = extractMeanSeries(response, 'ndmi', 'B0');
    const dryMonths  = getDrySeasonMonths(lat, lon);
    return this.analyzeIrrigation(series, dryMonths, hasAnaOutorga, locationLabel, input);
  }

  private async checkAnaOutorgas(lat: number, lon: number, input: NormalizedInput): Promise<boolean> {
    try {
      // Check ANA outorgas within 2km of the location or within CAR geometry
      const query = input.type === InputType.CAR
        ? sql`
            SELECT COUNT(*) AS cnt
            FROM ana_outorgas ao
            JOIN car_registrations cr ON ST_Within(ao.geometry, cr.geometry)
            WHERE cr.car_number = ${input.value}
            LIMIT 1
          `
        : sql`
            SELECT COUNT(*) AS cnt
            FROM ana_outorgas
            WHERE ST_DWithin(
              geometry::geography,
              ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
              2000
            )
            LIMIT 1
          `;

      const rows = await db.execute<{ cnt: string }>(query);
      return parseInt(rows.rows?.[0]?.cnt ?? '0') > 0;
    } catch {
      return false; // Non-fatal
    }
  }

  private analyzeIrrigation(
    series: Array<{ date: string; mean: number }>,
    dryMonths: number[],
    hasAnaOutorga: boolean,
    label: string,
    input: NormalizedInput
  ): CheckerResult {
    if (series.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No valid Sentinel-2 observations available',
        details: { input: input.value },
        executionTimeMs: 0,
        cached: false
      };
    }

    // Filter to dry season months
    const drySeasonSeries = series.filter(s => {
      const month = new Date(s.date).getMonth() + 1;
      return dryMonths.includes(month);
    });

    const NDMI_IRRIGATION_THRESHOLD = 0.15; // High moisture in dry season = likely irrigated

    const irrigatedDryMonths = drySeasonSeries.filter(s => s.mean > NDMI_IRRIGATION_THRESHOLD);
    const meanNdmiDrySeason  = drySeasonSeries.length > 0
      ? drySeasonSeries.reduce((a, b) => a + b.mean, 0) / drySeasonSeries.length
      : 0;

    const irrigationDetected = irrigatedDryMonths.length >= 2 || meanNdmiDrySeason > NDMI_IRRIGATION_THRESHOLD;

    const evidence = {
      dataSource: 'Sentinel-2 L2A — NDMI (Moisture Index) via Sentinel Hub Statistical API (10m) + ANA Outorgas',
      url: 'https://www.sentinel-hub.com/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(input.type === InputType.CAR ? { car_number: input.value } : { coordinates: label }),
      irrigation_detected:         irrigationDetected,
      ana_outorga_found:           hasAnaOutorga,
      mean_ndmi_dry_season:        parseFloat(meanNdmiDrySeason.toFixed(4)),
      irrigated_dry_months_count:  irrigatedDryMonths.length,
      dry_season_months_analyzed:  drySeasonSeries.length,
      ndmi_time_series:            series,
      ndmi_threshold:              NDMI_IRRIGATION_THRESHOLD
    };

    // FAIL: irrigation detected without outorga
    if (irrigationDetected && !hasAnaOutorga) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Possible unauthorized irrigation: high NDMI during dry season ` +
          `(${irrigatedDryMonths.length} months above threshold) — no ANA water use permit found.`,
        details: {
          ...baseDetails,
          recommendation:
            'High vegetation moisture detected during dry months suggests active irrigation. ' +
            'No ANA outorga (water use permit) found within 2km. This may constitute ' +
            'unauthorized water use (Lei 9.433/1997). Verify with ANA and SICAR.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: irrigation detected but outorga exists
    if (irrigationDetected && hasAnaOutorga) {
      return {
        status: CheckStatus.PASS,
        message:
          `Irrigation activity detected and ANA water use permit found. ` +
          `NDMI dry season mean: ${meanNdmiDrySeason.toFixed(3)}.`,
        details: baseDetails,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: no irrigation detected
    return {
      status: CheckStatus.PASS,
      message:
        `No irrigation detected. NDMI during dry season: ${meanNdmiDrySeason.toFixed(3)} ` +
        `(below ${NDMI_IRRIGATION_THRESHOLD} threshold).`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  private async resolveGeometry(input: NormalizedInput): Promise<{
    geometry: SHGeometry | null; locationLabel: string; lat: number; lon: number;
  }> {
    if (input.type === InputType.COORDINATES && input.coordinates) {
      const { lat, lon } = input.coordinates;
      return { geometry: pointToPolygon(lat, lon), locationLabel: `${lat},${lon}`, lat, lon };
    }
    if (input.type === InputType.CAR) {
      const rows = await db.execute<{ geojson: string; lat: number; lon: number }>(sql`
        SELECT ST_AsGeoJSON(ST_Simplify(geometry, 0.001)) AS geojson,
               ST_Y(ST_Centroid(geometry)) AS lat,
               ST_X(ST_Centroid(geometry)) AS lon
        FROM car_registrations WHERE car_number = ${input.value} LIMIT 1
      `);
      const row = rows.rows?.[0];
      if (!row?.geojson) return { geometry: null, locationLabel: input.value, lat: 0, lon: 0 };
      let geometry = JSON.parse(row.geojson) as SHGeometry;
      // Fall back to centroid bbox if polygon is too large for Sentinel Hub (>~55km)
      if (geometryExceedsSentinelLimit(geometry)) {
        geometry = pointToPolygon(row.lat, row.lon);
      }
      return {
        geometry,
        locationLabel: `CAR ${input.value}`,
        lat: row.lat,
        lon: row.lon
      };
    }
    return { geometry: null, locationLabel: input.value, lat: 0, lon: 0 };
  }
}

export default new IrrigationDetectionChecker();
