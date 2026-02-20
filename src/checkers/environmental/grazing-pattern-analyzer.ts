/**
 * Grazing Pattern Analyzer
 *
 * Detecta eventos de pastejo, tempo de recuperação pós-pastejo e regularidade
 * de rotação a partir da série temporal NDVI MODIS (MOD13Q1, 250m, 16 dias).
 *
 * Usa o mesmo endpoint ORNL DAAC já empregado pelo NdviProductivityChecker.
 * Auth: None (public API)
 *
 * Data source: NASA MODIS MOD13Q1 v6.1 via ORNL DAAC
 * API: https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset
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

// --- Constants ---

const ORNL_BASE_URL  = 'https://modis.ornl.gov/rst/api/v1';
const MODIS_PRODUCT  = 'MOD13Q1';
const MODIS_BAND     = '250m_16_days_NDVI';
const SCALE_FACTOR   = 0.0001;
const BATCH_DAYS     = 160;

// Minimum drop in NDVI to qualify as a grazing event
const GRAZING_DROP_THRESHOLD = 0.10;
// NDVI value above which we assume dense native vegetation (not grazed)
const HIGH_NATIVE_THRESHOLD = 0.65;
// Recovery target: percentage of pre-event baseline
const RECOVERY_RATIO = 0.90;

// --- Types ---

interface OrnlSubset {
  subset?: Array<{ calendar_date: string; data?: number[] }>;
}

interface NdviPoint {
  date: string;
  ndvi: number;
}

interface GrazingEvent {
  startIndex:      number;
  startDate:       string;
  peakDropIndex:   number;
  peakDropDate:    string;
  preNdvi:         number;
  minNdvi:         number;
  dropMagnitude:   number;
  recoveryDays:    number;
  recoveryClass:   'fast' | 'moderate' | 'slow' | 'none';
}

interface RotationPattern {
  eventCount:      number;
  meanIntervalDays: number;
  regularityCV:    number;
  pattern:         'regular' | 'irregular' | 'random' | 'insufficient';
}

// --- Utility ---

function toModisDate(d: Date): string {
  const yearStart = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - yearStart.getTime()) / 86400000);
  return `A${d.getFullYear()}${String(doy).padStart(3, '0')}`;
}

function daysBetween(dateA: string, dateB: string): number {
  return Math.round(
    (new Date(dateB).getTime() - new Date(dateA).getTime()) / 86400000
  );
}

// --- Algorithm ---

function detectGrazingEvents(series: NdviPoint[]): GrazingEvent[] {
  const events: GrazingEvent[] = [];
  const n = series.length;
  if (n < 5) return events;

  // Slide a 5-observation window: compare pre-window max to post-window min
  for (let i = 2; i < n - 2; i++) {
    const preWindow  = series.slice(Math.max(0, i - 2), i);
    const postWindow = series.slice(i, Math.min(n, i + 3));

    const preMax  = Math.max(...preWindow.map(p => p.ndvi));
    const postMin = Math.min(...postWindow.map(p => p.ndvi));
    const drop    = preMax - postMin;

    if (drop < GRAZING_DROP_THRESHOLD) continue;
    // Skip if pre-event NDVI is very high — likely native vegetation not pasture
    if (preMax > HIGH_NATIVE_THRESHOLD) continue;

    const minIdx  = i + postWindow.findIndex(p => p.ndvi === postMin);
    const recovery = calculateRecovery(minIdx, postMin, preMax, series);

    events.push({
      startIndex:    i,
      startDate:     series[i].date,
      peakDropIndex: minIdx,
      peakDropDate:  series[minIdx].date,
      preNdvi:       parseFloat(preMax.toFixed(3)),
      minNdvi:       parseFloat(postMin.toFixed(3)),
      dropMagnitude: parseFloat(drop.toFixed(3)),
      recoveryDays:  recovery.days,
      recoveryClass: recovery.cls
    });
  }

  // Deduplicate: remove events whose peakDropIndex overlaps within 2 steps
  const deduped: GrazingEvent[] = [];
  for (const ev of events) {
    const overlaps = deduped.some(
      d => Math.abs(d.peakDropIndex - ev.peakDropIndex) <= 2
    );
    if (!overlaps) deduped.push(ev);
  }

  return deduped;
}

function calculateRecovery(
  minIdx:   number,
  minNdvi:  number,
  preMax:   number,
  series:   NdviPoint[]
): { days: number; cls: GrazingEvent['recoveryClass'] } {
  const target = minNdvi + (preMax - minNdvi) * RECOVERY_RATIO;
  const minDate = series[minIdx].date;

  for (let j = minIdx + 1; j < series.length; j++) {
    if (series[j].ndvi >= target) {
      const days = daysBetween(minDate, series[j].date);
      const cls: GrazingEvent['recoveryClass'] =
        days <= 32  ? 'fast' :
        days <= 64  ? 'moderate' :
                      'slow';
      return { days, cls };
    }
  }
  return { days: -1, cls: 'none' };
}

function detectRotationPattern(events: GrazingEvent[]): RotationPattern {
  if (events.length < 2) {
    return {
      eventCount:       events.length,
      meanIntervalDays: 0,
      regularityCV:     0,
      pattern:          'insufficient'
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < events.length; i++) {
    intervals.push(daysBetween(events[i - 1].startDate, events[i].startDate));
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  const std = Math.sqrt(variance);
  const cv  = mean > 0 ? std / mean : 0;

  const pattern: RotationPattern['pattern'] =
    cv < 0.25  ? 'regular' :
    cv < 0.5   ? 'irregular' :
                 'random';

  return {
    eventCount:       events.length,
    meanIntervalDays: Math.round(mean),
    regularityCV:     parseFloat(cv.toFixed(3)),
    pattern
  };
}

// --- Checker ---

export class GrazingPatternAnalyzerChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Grazing Pattern Analyzer (MODIS)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Detecta eventos de pastejo, tempo de recuperação e regularidade de rotação ' +
      'via série temporal NDVI MODIS MOD13Q1 (250m, 16 dias, 1 ano). ' +
      'Identifica superpastejo e padrões de rotação sustentável.',
    priority: 7,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR],
    supportedCountries: [Country.BRAZIL, Country.URUGUAY, Country.ARGENTINA, Country.PARAGUAY, Country.BOLIVIA, Country.CHILE, Country.COLOMBIA, Country.PERU] // Global MODIS data
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800,  // 7 days (MODIS 16-day composites)
    timeout:  45000    // 3 ORNL batches × up to 12s each
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

    logger.debug({ lat, lon }, 'Fetching NDVI time-series for Grazing Pattern Analysis');

    const series = await this.fetchNdviSeries(lat, lon);
    return this.buildResult(series, locationMeta);
  }

  // --- Get CAR centroid from DB ---

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

  // --- Fetch NDVI series (same batching strategy as NdviProductivityChecker) ---

  private async fetchNdviSeries(lat: number, lon: number): Promise<NdviPoint[]> {
    const now        = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

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
          logger.warn({ status: resp.status, lat, lon }, 'ORNL MODIS MOD13Q1 API error (grazing)');
        }
      } catch {
        // Non-fatal: skip batch on timeout or network error
      }
    }

    const series: NdviPoint[] = [];
    for (const s of allSubsets) {
      const rawVal = s.data?.[0];
      if (rawVal == null || rawVal <= -3000) continue;
      const ndvi = rawVal * SCALE_FACTOR;
      if (ndvi < -1 || ndvi > 1) continue;
      series.push({ date: s.calendar_date, ndvi });
    }

    return series.sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- Build result from NDVI series ---

  private buildResult(
    series: NdviPoint[],
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
        message: 'Insufficient NDVI data for grazing analysis (possible cloud cover or data gap)',
        details: { location, observations: series.length },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    const events          = detectGrazingEvents(series);
    const rotation        = detectRotationPattern(events);
    const currentNdvi     = series[series.length - 1].ndvi;

    // Recovery metrics
    const recoveredEvents     = events.filter(e => e.recoveryClass !== 'none');
    const fastCount           = events.filter(e => e.recoveryClass === 'fast').length;
    const slowCount           = events.filter(e => e.recoveryClass === 'slow').length;
    const noRecoveryCount     = events.filter(e => e.recoveryClass === 'none').length;
    const meanRecoveryDays    = recoveredEvents.length > 0
      ? Math.round(recoveredEvents.reduce((s, e) => s + e.recoveryDays, 0) / recoveredEvents.length)
      : 0;

    const details = {
      location,
      current_ndvi:      parseFloat(currentNdvi.toFixed(3)),
      grazing_events:    events.map(e => ({
        start_date:       e.startDate,
        peak_drop_date:   e.peakDropDate,
        pre_ndvi:         e.preNdvi,
        min_ndvi:         e.minNdvi,
        drop_magnitude:   e.dropMagnitude,
        recovery_days:    e.recoveryDays,
        recovery_class:   e.recoveryClass
      })),
      rotation_pattern: {
        event_count:        rotation.eventCount,
        mean_interval_days: rotation.meanIntervalDays,
        regularity_score:   rotation.regularityCV,
        pattern:            rotation.pattern
      },
      recovery_metrics: {
        mean_recovery_days: meanRecoveryDays,
        fast_count:         fastCount,
        slow_count:         slowCount,
        no_recovery_count:  noRecoveryCount
      },
      time_series: series.map(s => ({
        date: s.date,
        ndvi: parseFloat(s.ndvi.toFixed(3))
      }))
    };

    // --- Status logic ---

    // FAIL: severe overgrazing
    if (
      currentNdvi < 0.2 &&
      events.length >= 3 &&
      meanRecoveryDays > 90
    ) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message: `Severe overgrazing detected. NDVI=${currentNdvi.toFixed(3)}, ${events.length} events, avg recovery ${meanRecoveryDays}d`,
        details: {
          ...details,
          recommendation: 'Immediate reduction in stocking density recommended. Cross-check with IBAMA embargoes and CAR status.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING MEDIUM: slow recovery or very irregular rotation or low current NDVI
    if (
      meanRecoveryDays > 90 ||
      rotation.regularityCV > 0.5 ||
      (currentNdvi < 0.35 && events.length > 0)
    ) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message: `Potential overgrazing indicators. NDVI=${currentNdvi.toFixed(3)}, rotation: ${rotation.pattern}, avg recovery ${meanRecoveryDays}d`,
        details: {
          ...details,
          recommendation: 'Review stocking density and rotation intervals. Slow recovery suggests insufficient rest periods.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING LOW: irregular or intensive grazing intervals
    if (
      events.length > 0 &&
      (rotation.pattern === 'irregular' ||
       (rotation.meanIntervalDays > 0 && rotation.meanIntervalDays < 60))
    ) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message: `Irregular or intensive grazing detected. ${events.length} events, mean interval ${rotation.meanIntervalDays}d (${rotation.pattern})`,
        details: {
          ...details,
          recommendation: 'Consider extending rest periods between grazing cycles to at least 60 days.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS: sustainable rotation or no events
    if (events.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: `No grazing events detected in the past year. NDVI=${currentNdvi.toFixed(3)}`,
        details: {
          ...details,
          recommendation: 'No grazing pressure detected. Area may be unharvested, native vegetation, or cropland.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message: `Sustainable rotational grazing pattern. ${events.length} events, mean interval ${rotation.meanIntervalDays}d (${rotation.pattern}), avg recovery ${meanRecoveryDays}d`,
      details: {
        ...details,
        recommendation: 'Rotational grazing pattern appears sustainable. Maintain current management practices.'
      },
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new GrazingPatternAnalyzerChecker();
