/**
 * Productivity vs Regional Benchmark Checker
 *
 * Compara a produtividade primária líquida (NPP) da propriedade com o benchmark
 * regional do bioma via NASA MODIS MOD17A3HGF (NPP anual, 500m, 5 anos).
 *
 * Detecta sub-utilização de área (possível abandono ou uso irregular).
 *
 * Critérios de análise:
 * - FAIL/HIGH:    NPP média < 35% do benchmark do bioma → abandono / sub-utilização severa
 * - FAIL/MEDIUM:  NPP média < 55% do benchmark do bioma → produtividade muito abaixo do esperado
 * - WARNING:      NPP média < 75% do benchmark do bioma → abaixo da média regional
 * - PASS:         NPP dentro ou acima do benchmark
 *
 * Também detecta tendência de queda (> 30% de redução de NPP nos últimos 5 anos).
 *
 * API: https://modis.ornl.gov/rst/api/v1/MOD17A3HGF/subset
 * Sem autenticação necessária (API pública ORNL DAAC).
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

// NPP benchmarks (kg C/m²/year) for productive agricultural/pasture land per biome
// Lower bound = degraded/abandoned land, upper bound = healthy productive land
interface BiomeBenchmark {
  name: string;
  healthy: number;   // typical NPP for well-managed land
  moderate: number;  // moderate productivity
  low: number;       // sub-utilization threshold
}

const BIOME_BENCHMARKS: Record<string, BiomeBenchmark> = {
  amazon:       { name: 'Amazônia',       healthy: 0.75, moderate: 0.50, low: 0.30 },
  cerrado:      { name: 'Cerrado',        healthy: 0.55, moderate: 0.37, low: 0.22 },
  caatinga:     { name: 'Caatinga',       healthy: 0.32, moderate: 0.20, low: 0.12 },
  mata_atlantica: { name: 'Mata Atlântica', healthy: 0.65, moderate: 0.43, low: 0.26 },
  pampa:        { name: 'Pampa',          healthy: 0.50, moderate: 0.33, low: 0.20 },
  pantanal:     { name: 'Pantanal',       healthy: 0.60, moderate: 0.40, low: 0.24 }
};

function detectBiome(lat: number, lon: number): string {
  // Simplified biome detection by lat/lon bounding boxes (Brazil)
  if (lat > -4  && lat < 5   && lon > -74 && lon < -44) return 'amazon';
  if (lat > -12 && lat < 0   && lon > -60 && lon < -44) return 'amazon';
  if (lat > -18 && lat < -4  && lon > -74 && lon < -44) return 'amazon';
  if (lat < -29 && lat > -34 && lon > -58 && lon < -49) return 'pampa';
  if (lat < -17 && lat > -22 && lon > -59 && lon < -54) return 'pantanal';
  if (lat > -8  && lat < 0   && lon > -46 && lon < -36) return 'caatinga';
  if (lat > -12 && lat < -4  && lon > -44 && lon < -36) return 'caatinga';
  if (lat > -18 && lat < -8  && lon > -46 && lon < -36) return 'caatinga';
  if (lat < -23 && lat > -35 && lon > -54 && lon < -40) return 'mata_atlantica';
  if (lat < -15 && lat > -25 && lon > -52 && lon < -40) return 'mata_atlantica';
  return 'cerrado'; // Default for central Brazil
}

interface NppDataPoint {
  year: number;
  npp: number; // kg C/m²/year
}

export class ProductivityBenchmarkChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Productivity vs Regional Benchmark (MODIS NPP)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Compara produtividade primária líquida (NPP) da propriedade com benchmark regional do bioma ' +
      'via NASA MODIS MOD17A3HGF (NPP anual 500m, 5 anos). Detecta sub-utilização e abandono de área.',
    priority: 4,
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

  // --- Check by GPS coordinates ---

  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) throw new Error('Coordinates required');
    const { lat, lon } = input.coordinates;
    const nppData = await this.fetchNPP(lat, lon);
    return this.analyzeProductivity(nppData, { lat, lon }, null);
  }

  // --- Check by CAR number ---

  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;

    const rows = await db.execute<{ lat: number; lon: number; area_ha: number | null }>(sql`
      SELECT
        ST_Y(ST_Centroid(geometry)) AS lat,
        ST_X(ST_Centroid(geometry)) AS lon,
        area_ha
      FROM car_registrations
      WHERE car_number = ${carCode}
      LIMIT 1
    `);

    const car = rows.rows?.[0];

    if (!car || car.lat == null || car.lon == null) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: `CAR ${carCode} not found in local database`,
        details: { car_number: carCode },
        executionTimeMs: 0,
        cached: false
      };
    }

    const nppData = await this.fetchNPP(car.lat, car.lon);
    return this.analyzeProductivity(nppData, { lat: car.lat, lon: car.lon }, carCode);
  }

  // --- Fetch NPP annual data from ORNL DAAC ---

  private async fetchNPP(lat: number, lon: number): Promise<NppDataPoint[]> {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 5;

    // MOD17A3HGF: annual NPP, one tile per year
    // Date format: A{YEAR}001 (day of year 001 = Jan 1)
    const url = new URL(`${ORNL_DAAC_BASE}/MOD17A3HGF/subset`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('band', 'Npp_500m');
    url.searchParams.set('startDate', `A${startYear}001`);
    url.searchParams.set('endDate', `A${currentYear - 1}365`);
    url.searchParams.set('kmAboveBelow', '0');
    url.searchParams.set('kmLeftRight', '0');

    logger.debug({ lat, lon, url: url.toString() }, 'ORNL DAAC NPP request');

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.4' },
      signal: AbortSignal.timeout(this.config.timeout ?? 15000)
    });

    if (!response.ok) {
      logger.warn({ status: response.status, lat, lon }, 'ORNL DAAC NPP request failed');
      return [];
    }

    const data = await response.json() as {
      band?: string;
      scale?: string;
      subset?: Array<{ calendar_date: string; data: number[] }>;
    };

    if (!data.subset || data.subset.length === 0) return [];

    const scale = parseFloat(data.scale ?? '0.0001');
    const FILL_VALUE = 32767;

    return data.subset
      .filter(s => s.data[0] !== FILL_VALUE && s.data[0] !== undefined)
      .map(s => ({
        year: parseInt(s.calendar_date.split('-')[0]),
        npp: parseFloat((s.data[0] * scale).toFixed(4))
      }))
      .filter(p => p.npp > 0);
  }

  // --- Analyze productivity vs benchmark ---

  private analyzeProductivity(
    nppData: NppDataPoint[],
    location: { lat: number; lon: number },
    carCode: string | null
  ): CheckerResult {
    if (nppData.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No NPP data available for this location (outside MODIS coverage or no valid pixels)',
        details: { ...(carCode ? { car_number: carCode } : { coordinates: location }) },
        executionTimeMs: 0,
        cached: false
      };
    }

    const biomeKey = detectBiome(location.lat, location.lon);
    const benchmark = BIOME_BENCHMARKS[biomeKey];

    const nppValues = nppData.map(d => d.npp);
    const meanNpp = nppValues.reduce((a, b) => a + b, 0) / nppValues.length;
    const maxNpp  = Math.max(...nppValues);
    const minNpp  = Math.min(...nppValues);

    // Productivity ratio vs biome healthy benchmark
    const productivityRatio = meanNpp / benchmark.healthy;
    const productivityPct   = Math.round(productivityRatio * 100);

    // Detect declining trend (compare first half vs second half)
    const half = Math.floor(nppData.length / 2);
    const firstHalfMean  = nppData.slice(0, half).reduce((s, d) => s + d.npp, 0) / (half || 1);
    const secondHalfMean = nppData.slice(half).reduce((s, d) => s + d.npp, 0) / (nppData.length - half || 1);
    const trendPct = firstHalfMean > 0
      ? Math.round(((secondHalfMean - firstHalfMean) / firstHalfMean) * 100)
      : 0;
    const isDeclining = trendPct < -25;

    const evidence = {
      dataSource: 'NASA MODIS MOD17A3HGF — Net Primary Productivity Annual (500m)',
      url: 'https://modis.ornl.gov/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      biome:                  benchmark.name,
      biome_benchmark_kg_c_m2: benchmark.healthy,
      mean_npp_kg_c_m2:       parseFloat(meanNpp.toFixed(4)),
      productivity_pct_of_benchmark: productivityPct,
      trend_pct_change:       trendPct,
      trend_direction:        trendPct > 5 ? 'improving' : trendPct < -5 ? 'declining' : 'stable',
      max_npp_kg_c_m2:        maxNpp,
      min_npp_kg_c_m2:        minNpp,
      years_analyzed:         nppData.length,
      npp_by_year:            nppData,
      methodology:
        'Annual NPP (kgC/m²/yr) from MODIS MOD17A3HGF (500m). ' +
        'Compared against biome-specific productivity benchmark for managed agricultural/pasture land. ' +
        'Trend = % change between first-half and second-half of the analysis period.'
    };

    // FAIL: severe sub-utilization (< 35% of benchmark) — likely abandonment
    if (meanNpp < benchmark.low * 1.0 || productivityRatio < 0.35) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Severe sub-utilization: NPP ${productivityPct}% of ${benchmark.name} benchmark ` +
          `(${meanNpp.toFixed(3)} vs ${benchmark.healthy} kgC/m²/yr). Possible land abandonment.`,
        details: {
          ...baseDetails,
          recommendation:
            'NPP is critically below the regional benchmark. Possible land abandonment or severe ' +
            'degradation. Cross-check with Pasture Degradation Index and PRODES/DETER alerts.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // FAIL: significantly below benchmark (35-55%) + declining trend
    if (productivityRatio < 0.55 || (productivityRatio < 0.70 && isDeclining)) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.MEDIUM,
        message:
          `Below-benchmark productivity: NPP ${productivityPct}% of ${benchmark.name} benchmark` +
          (isDeclining ? ` with declining trend (${trendPct}% over analysis period).` : '.'),
        details: {
          ...baseDetails,
          recommendation:
            'Property productivity is significantly below the regional benchmark. ' +
            'Possible degraded pasture, poor land management, or underutilization. ' +
            'Consider cross-checking with Pasture Degradation Index.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: below benchmark (55-75%)
    if (productivityRatio < 0.75) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Productivity below regional average: NPP ${productivityPct}% of ${benchmark.name} benchmark ` +
          `(${meanNpp.toFixed(3)} kgC/m²/yr).`,
        details: {
          ...baseDetails,
          recommendation:
            'Property NPP is below the regional average. May indicate suboptimal land management. ' +
            isDeclining ? `Declining trend (${trendPct}%) warrants monitoring.` : ''
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS
    const trendNote = isDeclining
      ? ` Note: declining trend of ${trendPct}% over the analysis period — monitor.`
      : trendPct > 10
        ? ` Improving trend (+${trendPct}%).`
        : '';

    return {
      status: CheckStatus.PASS,
      message:
        `Productivity within expected range: NPP ${productivityPct}% of ${benchmark.name} benchmark ` +
        `(${meanNpp.toFixed(3)} kgC/m²/yr).${trendNote}`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new ProductivityBenchmarkChecker();
