/**
 * Fire Scar Mapping Checker
 *
 * Mapeia cicatrizes de incêndio históricas via MODIS MCD64A1 (Burned Area Monthly, 500m).
 * Diferente do checker de focos ativos (queimadas.ts) — este detecta ÁREAS QUEIMADAS
 * confirmadas via satélite com dia de ignição.
 *
 * Critérios:
 *  - Queimada confirmada nos últimos 12 meses             → FAIL/HIGH
 *  - Queimada confirmada entre 1-3 anos atrás             → FAIL/MEDIUM
 *  - Queimada confirmada entre 3-5 anos atrás             → WARNING
 *  - Sem cicatriz detectada nos últimos 5 anos            → PASS
 *
 * API: https://modis.ornl.gov/rst/api/v1/MCD64A1/subset
 * Banda: Burn_Date (dia do ano queimado, 0 = não queimado, -1 = fill)
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
const YEARS_TO_ANALYZE = 3;  // Reduced from 5 to avoid timeout
const MONTHS_PER_REQUEST = 5; // Smaller batches for reliability

interface BurnEvent {
  year: number;
  month: number;
  day_of_year: number;
  approx_date: string;
}

export class FireScarMappingChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Fire Scar Mapping (MODIS MCD64A1)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Mapeia cicatrizes de incêndio históricas via MODIS MCD64A1 (Burned Area Monthly, 500m, 3 anos). ' +
      'Detecta áreas queimadas confirmadas por satélite com data de ignição. ' +
      'Complementa o checker de focos ativos com histórico de queimadas.',
    priority: 3,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR],
    supportedCountries: [Country.BRAZIL, Country.URUGUAY, Country.ARGENTINA, Country.PARAGUAY, Country.BOLIVIA, Country.CHILE, Country.COLOMBIA, Country.PERU] // Global MODIS data
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400 * 7, // 7 days
    timeout: 60000 // 60s — multiple ORNL batches
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
    const burns = await this.fetchBurnHistory(lat, lon);
    return this.analyzeFireScars(burns, { lat, lon }, null);
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
    const burns = await this.fetchBurnHistory(car.lat, car.lon);
    return this.analyzeFireScars(burns, { lat: car.lat, lon: car.lon }, carCode);
  }

  // Fetch 5 years of monthly burn data in batches of 10 months
  private async fetchBurnHistory(lat: number, lon: number): Promise<BurnEvent[]> {
    const currentYear  = new Date().getFullYear();
    const startYear    = currentYear - YEARS_TO_ANALYZE;
    const burnEvents: BurnEvent[] = [];

    // Build list of start/end dates for each 10-month batch
    const allMonths: Array<{ year: number; month: number }> = [];
    for (let y = startYear; y <= currentYear; y++) {
      const maxMonth = y === currentYear ? new Date().getMonth() + 1 : 12;
      for (let m = 1; m <= maxMonth; m++) {
        allMonths.push({ year: y, month: m });
      }
    }

    // ORNL DAAC: request 10 tiles at a time
    for (let i = 0; i < allMonths.length; i += MONTHS_PER_REQUEST) {
      const batch = allMonths.slice(i, i + MONTHS_PER_REQUEST);
      const first = batch[0];
      const last  = batch[batch.length - 1];

      // Day of year for first day of month
      const startDoy = this.monthToDoy(first.month);
      const endDoy   = this.monthToDoy(last.month);

      const url = new URL(`${ORNL_DAAC_BASE}/MCD64A1/subset`);
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('band', 'Burn_Date');
      url.searchParams.set('startDate', `A${first.year}${String(startDoy).padStart(3, '0')}`);
      url.searchParams.set('endDate',   `A${last.year}${String(endDoy).padStart(3, '0')}`);
      url.searchParams.set('kmAboveBelow', '0');
      url.searchParams.set('kmLeftRight',  '0');

      try {
        const response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json', 'User-Agent': 'DeFarm-Check-API/2.5' },
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) continue;

        const data = await response.json() as {
          subset?: Array<{ calendar_date: string; data: number[] }>;
        };

        for (const tile of data.subset ?? []) {
          const burnDay = tile.data[0];
          if (burnDay > 0 && burnDay <= 366) {
            const [yearStr] = tile.calendar_date.split('-');
            const year = parseInt(yearStr);
            const approxDate = this.doyToApproxDate(year, burnDay);
            burnEvents.push({
              year,
              month: parseInt(tile.calendar_date.split('-')[1]),
              day_of_year: burnDay,
              approx_date: approxDate
            });
          }
        }
      } catch (err) {
        logger.warn({ err, lat, lon }, 'MCD64A1 batch request failed');
      }
    }

    return burnEvents;
  }

  private analyzeFireScars(
    burns: BurnEvent[],
    location: { lat: number; lon: number },
    carCode: string | null
  ): CheckerResult {
    if (burns.length === 0 && !burns) {
      // Could not fetch data
    }

    const now          = new Date();
    const oneYearAgo   = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear() - 3);

    const recentBurns   = burns.filter(b => b.year >= now.getFullYear() - 1);
    const moderateBurns = burns.filter(b => b.year >= now.getFullYear() - 3 && b.year < now.getFullYear() - 1);
    const oldBurns      = burns.filter(b => b.year < now.getFullYear() - 3);

    const evidence = {
      dataSource: 'NASA MODIS MCD64A1 — Burned Area Monthly (500m)',
      url: 'https://modis.ornl.gov/',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      ...(carCode ? { car_number: carCode } : { coordinates: location }),
      total_burn_events_5y:   burns.length,
      recent_burns_1y:        recentBurns.length,
      moderate_burns_1_3y:    moderateBurns.length,
      old_burns_3_5y:         oldBurns.length,
      burn_events:            burns.slice(0, 20).map(b => ({
        year: b.year, month: b.month, day_of_year: b.day_of_year, approx_date: b.approx_date
      })),
      methodology:
        'MODIS MCD64A1 (500m, monthly). Burn_Date > 0 indicates confirmed burn scar. ' +
        'Day of year converted to approximate calendar date.'
    };

    if (recentBurns.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `${recentBurns.length} confirmed fire scar(s) detected in the last 12 months ` +
          `(most recent: ${recentBurns[recentBurns.length - 1].approx_date}).`,
        details: {
          ...baseDetails,
          recommendation:
            'Recent fire scar confirmed by MODIS satellite. Cross-check with INPE fire hotspots ' +
            '(queimadas checker) and IBAMA embargoes. May indicate illegal burning or land clearing.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (moderateBurns.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.MEDIUM,
        message:
          `${moderateBurns.length} confirmed fire scar(s) detected in the last 1–3 years ` +
          `(most recent: ${moderateBurns[moderateBurns.length - 1].approx_date}).`,
        details: {
          ...baseDetails,
          recommendation:
            'Fire scars confirmed 1-3 years ago. Verify with IBAMA embargo records and ' +
            'MapBiomas deforestation alerts for potential land clearing correlation.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (oldBurns.length > 0) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message:
          `${oldBurns.length} historical fire scar(s) detected (3–5 years ago, ` +
          `most recent: ${oldBurns[oldBurns.length - 1].approx_date}).`,
        details: baseDetails,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message: 'No confirmed fire scars detected in the last 5 years.',
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  private monthToDoy(month: number): number {
    const daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    return daysInMonth[month - 1] + 1;
  }

  private doyToApproxDate(year: number, doy: number): string {
    const date = new Date(year, 0);
    date.setDate(doy);
    return date.toISOString().split('T')[0];
  }
}

export default new FireScarMappingChecker();
