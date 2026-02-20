/**
 * Phenology & Crop Cycles Checker
 *
 * Detecta ciclos de plantio/colheita e anomalias de fenologia via MODIS MCD12Q2
 * (Land Cover Dynamics, 500m, anual). Identifica mudanças de uso do solo que
 * não foram declaradas no CAR.
 *
 * Análises:
 *  - Número de ciclos de vegetação por ano (NumCycles) → pastagem vs lavoura
 *  - Amplitude EVI (EVI_Amplitude) → intensidade produtiva do ciclo
 *  - Mudança de fenologia entre anos → possível conversão não declarada
 *
 * Critérios:
 *  - NumCycles passou de 0/1 para 2+ (irrigação/dupla safra detectada)   → WARNING
 *  - Amplitude EVI aumentou > 50% em 2 anos (intensificação súbita)      → WARNING
 *  - NumCycles = 0 por 2+ anos consecutivos (abandono)                   → WARNING
 *  - Fenologia estável e consistente                                      → PASS
 *
 * API: https://modis.ornl.gov/rst/api/v1/MCD12Q2/subset
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
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

const ORNL_DAAC_BASE = 'https://modis.ornl.gov/rst/api/v1';
const YEARS_TO_ANALYZE = 5;

interface PhenologyYear {
  year: number;
  num_cycles: number;
  evi_amplitude: number;    // EVI amplitude of primary cycle (scaled)
  greenup_doy: number | null; // Day of year of greenup onset
  dormancy_doy: number | null;
}

export class PhenologyCropCyclesChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Phenology & Crop Cycles (MODIS MCD12Q2)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Detecta ciclos de plantio/colheita e anomalias de fenologia via MODIS MCD12Q2 ' +
      '(Land Cover Dynamics 500m, anual). Identifica conversões não declaradas, ' +
      'irrigação, dupla safra e abandono de área.',
    priority: 2,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 30, // 30 days (annual data)
    timeout: 20000
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
    const phenology = await this.fetchPhenology(lat, lon);
    return this.analyzePhenology(phenology, { lat, lon }, null);
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
    const phenology = await this.fetchPhenology(car.lat, car.lon);
    return this.analyzePhenology(phenology, { lat: car.lat, lon: car.lon }, carCode);
  }

  private async fetchPhenology(lat: number, lon: number): Promise<PhenologyYear[]> {
    const currentYear = new Date().getFullYear();
    const startYear   = currentYear - YEARS_TO_ANALYZE;

    // Fetch NumCycles and EVI_Amplitude in parallel
    const [cyclesData, eviData, greenupData] = await Promise.all([
      this.fetchBand(lat, lon, 'NumCycles', startYear, currentYear - 1),
      this.fetchBand(lat, lon, 'EVI_Amplitude.Num_Modes_01', startYear, currentYear - 1),
      this.fetchBand(lat, lon, 'Greenup.Num_Modes_01', startYear, currentYear - 1)
    ]);

    const yearMap = new Map<number, PhenologyYear>();

    for (const entry of cyclesData) {
      yearMap.set(entry.year, {
        year:          entry.year,
        num_cycles:    entry.value,
        evi_amplitude: 0,
        greenup_doy:   null,
        dormancy_doy:  null
      });
    }

    for (const entry of eviData) {
      const existing = yearMap.get(entry.year);
      if (existing) {
        // EVI_Amplitude scale = 0.0001
        existing.evi_amplitude = parseFloat((entry.value * 0.0001).toFixed(4));
      }
    }

    // Greenup dates are in days-since-1970-01-01
    for (const entry of greenupData) {
      const existing = yearMap.get(entry.year);
      if (existing && entry.value > 0) {
        const epoch = new Date('1970-01-01');
        epoch.setDate(epoch.getDate() + entry.value);
        existing.greenup_doy = Math.floor((epoch.getTime() - new Date(epoch.getFullYear(), 0, 0).getTime()) / 86400000);
      }
    }

    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
  }

  private async fetchBand(
    lat: number, lon: number, band: string,
    startYear: number, endYear: number
  ): Promise<Array<{ year: number; value: number }>> {
    const url = new URL(`${ORNL_DAAC_BASE}/MCD12Q2/subset`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('band', band);
    url.searchParams.set('startDate', `A${startYear}001`);
    url.searchParams.set('endDate',   `A${endYear}365`);
    url.searchParams.set('kmAboveBelow', '0');
    url.searchParams.set('kmLeftRight',  '0');

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.5' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return [];

      const data = await response.json() as {
        subset?: Array<{ calendar_date: string; data: number[] }>;
      };

      const FILL_VALUE = 32767;
      return (data.subset ?? [])
        .filter(s => s.data[0] !== undefined && s.data[0] !== FILL_VALUE && s.data[0] >= 0)
        .map(s => ({ year: parseInt(s.calendar_date.split('-')[0]), value: s.data[0] }));
    } catch {
      return [];
    }
  }

  private analyzePhenology(
    phenology: PhenologyYear[],
    location: { lat: number; lon: number },
    carCode: string | null
  ): CheckerResult {
    if (phenology.length === 0) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'No phenology data available for this location (outside MODIS coverage or no valid pixels)',
        details: { ...(carCode ? { car_number: carCode } : { coordinates: location }) },
        executionTimeMs: 0,
        cached: false
      };
    }

    const latestYear = phenology[phenology.length - 1];
    const earliestYear = phenology[0];

    // Check for abandonment (NumCycles = 0 for 2+ consecutive years)
    let consecutiveZero = 0;
    let maxConsecutiveZero = 0;
    for (const p of phenology) {
      if (p.num_cycles === 0) { consecutiveZero++; maxConsecutiveZero = Math.max(maxConsecutiveZero, consecutiveZero); }
      else consecutiveZero = 0;
    }

    // Check for shift to multi-cycle (double crop / irrigation detected)
    const earlyMultiCycle = earliestYear.num_cycles >= 2;
    const recentMultiCycle = latestYear.num_cycles >= 2;
    const shiftToMultiCycle = !earlyMultiCycle && recentMultiCycle;

    // EVI amplitude change (intensification signal)
    const eviChange = earliestYear.evi_amplitude > 0
      ? ((latestYear.evi_amplitude - earliestYear.evi_amplitude) / earliestYear.evi_amplitude) * 100
      : 0;
    const suddenIntensification = eviChange > 50 && phenology.length >= 3;

    const evidence = {
      dataSource: 'NASA MODIS MCD12Q2 — Land Cover Dynamics (500m, annual)',
      url: 'https://modis.ornl.gov/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      current_num_cycles:     latestYear.num_cycles,
      current_evi_amplitude:  latestYear.evi_amplitude,
      current_greenup_doy:    latestYear.greenup_doy,
      evi_pct_change_vs_start: Math.round(eviChange),
      max_consecutive_no_cycle: maxConsecutiveZero,
      years_analyzed:          phenology.length,
      phenology_by_year:       phenology,
      methodology:
        'MODIS MCD12Q2 annual land cover dynamics (500m). NumCycles = vegetation growth cycles per year. ' +
        'EVI_Amplitude = peak intensity of primary growth cycle. ' +
        'Greenup date in days-since-1970 converted to day-of-year.'
    };

    // WARNING: abandonment (no cycles for 2+ years)
    if (maxConsecutiveZero >= 2) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Possible land abandonment: no vegetation cycles detected for ` +
          `${maxConsecutiveZero} consecutive year(s).`,
        details: {
          ...baseDetails,
          recommendation:
            'Zero vegetation cycles detected for multiple years. Possible abandonment, ' +
            'severe degradation, or bare soil. Cross-check with Pasture Degradation Index and NPP checker.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: shift to multi-cycle agriculture (double crop / irrigation)
    if (shiftToMultiCycle) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Multi-cycle agriculture detected (${latestYear.num_cycles} cycles/year). ` +
          `Previously ${earliestYear.num_cycles} cycle(s). Possible undeclared irrigation or double-crop expansion.`,
        details: {
          ...baseDetails,
          recommendation:
            'Property shifted to multi-cycle cultivation. Verify water use authorization (ANA outorga) ' +
            'and whether land use declaration in CAR/SICAR was updated.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: sudden EVI intensification (50%+ increase)
    if (suddenIntensification) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `Significant vegetation productivity intensification detected: +${Math.round(eviChange)}% EVI amplitude change.`,
        details: {
          ...baseDetails,
          recommendation:
            'EVI amplitude increased significantly, indicating a change in land management intensity. ' +
            'Verify if land use change was declared in CAR/SICAR.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    const cycleDescription = latestYear.num_cycles === 0
      ? 'no vegetation cycles (possible bare soil/water)'
      : latestYear.num_cycles === 1
        ? 'single annual crop/pasture cycle'
        : `${latestYear.num_cycles} vegetation cycles/year`;

    return {
      status: CheckStatus.PASS,
      message: `Stable phenology: ${cycleDescription}. EVI amplitude: ${latestYear.evi_amplitude.toFixed(3)}.`,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new PhenologyCropCyclesChecker();
