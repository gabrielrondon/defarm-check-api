/**
 * Crop Mapping Checker (Sentinel-2 NDVI Time Series)
 *
 * Classifica o uso da terra via análise de séries temporais NDVI (Sentinel-2 L2A, 10m)
 * usando a Sentinel Hub Statistical API. Detecta:
 *   - Tipo de cobertura: agricultura vs pastagem vs vegetação nativa
 *   - Dupla safra / múltiplos ciclos agrícolas
 *   - Expansão agrícola sobre áreas nativas ou APP
 *
 * NDVI = (B08 - B04) / (B08 + B04)
 *   - NDVI > 0.6 + sazonal pronunciado → agricultura intensiva / lavoura
 *   - NDVI 0.3–0.6 + baixa variação    → pastagem / pousio
 *   - NDVI > 0.7 + alta estabilidade   → floresta / vegetação nativa densa
 *   - NDVI < 0.2                        → solo exposto / área degradada
 *
 * Detecção de ciclos agrícolas:
 *   - Conta picos de NDVI (local maxima > 0.5 separados por > 2 meses)
 *   - 2+ picos/ano → dupla safra
 *   - 1 pico/ano com alta amplitude → cultivo solteiro
 *   - Sem pico proeminente + baixo NDVI → pastagem ou degradação
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

// NDVI evalscript for Sentinel-2 L2A
const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04","B08"], units: "REFLECTANCE" }],
    output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.0001);
  return [ndvi];
}`;

type LandCoverType =
  | 'intensive_agriculture'
  | 'double_crop'
  | 'single_crop'
  | 'pasture'
  | 'native_vegetation'
  | 'degraded'
  | 'unknown';

interface CropAnalysis {
  landCoverType:   LandCoverType;
  ndviPeaksCount:  number;
  meanNdvi:        number;
  maxNdvi:         number;
  ndviAmplitude:   number;  // max - min NDVI
  ndviStdDev:      number;
  expansionDetected: boolean;
  recentHighNdvi:  boolean; // NDVI elevated in last 3 months (recent agricultural activity)
}

/**
 * Detects NDVI peaks (local maxima) in the time series.
 * A peak is a value > threshold where the adjacent values are lower.
 * Minimum separation of 2 observations (~2 months) between peaks.
 */
function detectNdviPeaks(
  series: Array<{ date: string; mean: number }>,
  threshold = 0.5,
  minSeparation = 2
): number[] {
  const peakIndices: number[] = [];

  for (let i = 1; i < series.length - 1; i++) {
    const v = series[i].mean;
    if (v < threshold) continue;

    const prevHigher = series[i - 1].mean < v;
    const nextHigher = series[i + 1].mean < v;

    if (prevHigher && nextHigher) {
      // Enforce minimum separation from last detected peak
      const lastPeak = peakIndices[peakIndices.length - 1];
      if (lastPeak === undefined || i - lastPeak >= minSeparation) {
        peakIndices.push(i);
      }
    }
  }

  return peakIndices;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function classifyLandCover(analysis: CropAnalysis): LandCoverType {
  const { meanNdvi, maxNdvi, ndviAmplitude, ndviStdDev, ndviPeaksCount } = analysis;

  // Degraded / bare soil
  if (maxNdvi < 0.2) return 'degraded';

  // Dense native vegetation: high mean NDVI, low variation
  if (meanNdvi > 0.65 && ndviAmplitude < 0.25 && ndviStdDev < 0.08) return 'native_vegetation';

  // Double crop: 2+ distinct peaks
  if (ndviPeaksCount >= 2) return 'double_crop';

  // Intensive/single crop: one pronounced peak with high amplitude
  if (ndviPeaksCount === 1 && ndviAmplitude > 0.35 && maxNdvi > 0.6) return 'single_crop';

  // Pasture: moderate NDVI, low amplitude, seasonal
  if (meanNdvi >= 0.25 && meanNdvi <= 0.60 && ndviAmplitude < 0.35) return 'pasture';

  // Intensive agriculture (NDVI high + high variability but no clear peak)
  if (meanNdvi > 0.55 && ndviStdDev > 0.10) return 'intensive_agriculture';

  return 'unknown';
}

export class CropMappingChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Crop Mapping (Sentinel-2 NDVI)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Classifica uso da terra via séries temporais NDVI Sentinel-2 (10m). ' +
      'Detecta tipo de cobertura (agricultura/pastagem/nativa), dupla safra e ' +
      'expansão agrícola irregular sobre vegetação nativa.',
    priority: 4,
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

    const now      = new Date();
    const fromDate = new Date(now); fromDate.setFullYear(now.getFullYear() - 2); // 2 years for cycle detection

    logger.debug({ checker: this.metadata.name, input: input.value }, 'Calling Sentinel Hub NDVI');

    const response = await sentinelHubStats({
      geometry,
      dataType:     'sentinel-2-l2a',
      fromDate:     fromDate.toISOString(),
      toDate:       now.toISOString(),
      intervalDays: 16, // 16-day composites to capture crop cycles
      evalscript:   NDVI_EVALSCRIPT,
      outputId:     'ndvi',
      maxCloudCover: 30
    });

    const series = extractMeanSeries(response, 'ndvi', 'B0');
    return this.analyzeCrops(series, locationLabel, input);
  }

  private analyzeCrops(
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

    const ndviValues   = series.map(s => s.mean);
    const meanNdvi     = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
    const maxNdvi      = Math.max(...ndviValues);
    const minNdvi      = Math.min(...ndviValues);
    const ndviAmplitude = maxNdvi - minNdvi;
    const ndviStd      = stdDev(ndviValues);

    const peakIndices  = detectNdviPeaks(series, 0.5, 3); // min 3 obs (~48 days) between peaks
    const peakCount    = peakIndices.length;

    // Check if agricultural activity (high NDVI) occurred recently (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentSeries  = series.filter(s => new Date(s.date) >= threeMonthsAgo);
    const recentHighNdvi = recentSeries.some(s => s.mean > 0.55);

    // Detect possible expansion: transition from low NDVI to high NDVI over observation period
    const firstHalf  = series.slice(0, Math.floor(series.length / 2));
    const secondHalf = series.slice(Math.floor(series.length / 2));
    const meanFirst  = firstHalf.length > 0  ? firstHalf.reduce((a, b) => a + b.mean, 0) / firstHalf.length : 0;
    const meanSecond = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b.mean, 0) / secondHalf.length : 0;

    // Expansion detected if NDVI increased significantly (+0.25) from first half to second half
    // combined with overall high variability — suggests cleared native veg then planted crops
    const expansionDetected = meanSecond - meanFirst > 0.25 && ndviStd > 0.12;

    const analysis: CropAnalysis = {
      landCoverType:    'unknown',
      ndviPeaksCount:   peakCount,
      meanNdvi,
      maxNdvi,
      ndviAmplitude,
      ndviStdDev:       ndviStd,
      expansionDetected,
      recentHighNdvi
    };
    analysis.landCoverType = classifyLandCover(analysis);

    const evidence = {
      dataSource: 'Sentinel-2 L2A — NDVI Time Series via Sentinel Hub Statistical API (10m, 16-day composites)',
      url: 'https://www.sentinel-hub.com/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(input.type === InputType.CAR ? { car_number: input.value } : { coordinates: label }),
      land_cover_type:         analysis.landCoverType,
      ndvi_peaks_detected:     peakCount,
      mean_ndvi:               parseFloat(meanNdvi.toFixed(4)),
      max_ndvi:                parseFloat(maxNdvi.toFixed(4)),
      ndvi_amplitude:          parseFloat(ndviAmplitude.toFixed(4)),
      ndvi_std_dev:            parseFloat(ndviStd.toFixed(4)),
      expansion_detected:      expansionDetected,
      recent_high_ndvi:        recentHighNdvi,
      observations_analyzed:   series.length,
      ndvi_time_series:        series,
      classification_logic: {
        degraded:             'maxNDVI < 0.2',
        native_vegetation:    'meanNDVI > 0.65 + amplitude < 0.25 + low variation',
        double_crop:          '2+ NDVI peaks/year above 0.5',
        single_crop:          '1 NDVI peak + amplitude > 0.35 + maxNDVI > 0.6',
        pasture:              'meanNDVI 0.25–0.60 + amplitude < 0.35',
        intensive_agriculture:'meanNDVI > 0.55 + high variability'
      }
    };

    // FAIL: agricultural expansion over previously low-NDVI area (possible native clearing)
    if (expansionDetected) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Possible agricultural expansion detected: NDVI increased significantly ` +
          `(+${(meanSecond - meanFirst).toFixed(2)}) over 2 years, suggesting ` +
          `native vegetation clearing followed by crop establishment.`,
        details: {
          ...baseDetails,
          ndvi_first_half_mean:  parseFloat(meanFirst.toFixed(4)),
          ndvi_second_half_mean: parseFloat(meanSecond.toFixed(4)),
          recommendation:
            'Significant NDVI increase detected, consistent with native vegetation clearing ' +
            'and crop planting. Cross-check with SICAR, PRODES/DETER alerts and Código Florestal ' +
            'APP/RL compliance. Unauthorized clearing may violate Lei 12.651/2012.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: double crop (intensive land use, possible irregular in some contexts)
    if (analysis.landCoverType === 'double_crop') {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Double cropping detected: ${peakCount} crop cycles observed in the last 2 years ` +
          `(mean NDVI ${meanNdvi.toFixed(3)}, amplitude ${ndviAmplitude.toFixed(3)}).`,
        details: {
          ...baseDetails,
          recommendation:
            'Multiple crop cycles detected. Verify that agricultural use is authorized ' +
            'within CAR boundaries and does not encroach on declared APP or Reserva Legal.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // INFO: degraded land
    if (analysis.landCoverType === 'degraded') {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Degraded / bare soil detected: max NDVI ${maxNdvi.toFixed(3)}, ` +
          `mean NDVI ${meanNdvi.toFixed(3)}. No significant vegetation cover found.`,
        details: {
          ...baseDetails,
          recommendation:
            'Very low NDVI suggests bare soil or severely degraded vegetation. ' +
            'This may indicate recent deforestation, overgrazing, or abandoned crop land. ' +
            'Cross-check with PRODES/DETER and IBAMA embargo records.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS for all other types
    const typeLabels: Record<LandCoverType, string> = {
      intensive_agriculture: 'Intensive agriculture',
      double_crop:           'Double crop',
      single_crop:           'Single crop (annual cycle)',
      pasture:               'Pasture / managed grassland',
      native_vegetation:     'Native vegetation / forest',
      degraded:              'Degraded / bare soil',
      unknown:               'Unknown cover type'
    };

    return {
      status: CheckStatus.PASS,
      message:
        `Land cover classified as: ${typeLabels[analysis.landCoverType]}. ` +
        `NDVI mean ${meanNdvi.toFixed(3)}, ${peakCount} crop cycle(s) detected.`,
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

export default new CropMappingChecker();
