import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { logger } from '../../utils/logger.js';

const COUNTRIES = ['BR', 'UY', 'AR', 'PY', 'BO', 'CL', 'CO', 'PE'] as const;
const HORIZONS = [7, 30, 90] as const;

function getTrendLabel(delta: number | null): string {
  if (delta === null || Number.isNaN(delta)) return 'UNKNOWN';
  if (delta >= 5) return 'IMPROVING';
  if (delta <= -5) return 'DETERIORATING';
  return 'STABLE';
}

async function calculateAndStore(country: string, horizonDays: number): Promise<void> {
  const now = new Date();

  const recent = await db.execute(sql`
    SELECT
      COUNT(*)::int as checks_count,
      AVG(score)::float as avg_score,
      AVG(CASE WHEN verdict = 'NON_COMPLIANT' THEN 1 ELSE 0 END)::float as non_compliant_rate
    FROM check_requests
    WHERE country = ${country}
      AND created_at >= NOW() - (${horizonDays} * INTERVAL '1 day')
  `);

  const previous = await db.execute(sql`
    SELECT AVG(score)::float as avg_score
    FROM check_requests
    WHERE country = ${country}
      AND created_at < NOW() - (${horizonDays} * INTERVAL '1 day')
      AND created_at >= NOW() - (${horizonDays * 2} * INTERVAL '1 day')
  `);

  const recentRow = (recent.rows?.[0] as any) || {};
  const previousRow = (previous.rows?.[0] as any) || {};

  const checksCount = Number(recentRow.checks_count || 0);
  const avgScore = recentRow.avg_score !== null && recentRow.avg_score !== undefined
    ? Number(recentRow.avg_score)
    : null;
  const nonCompliantRate = recentRow.non_compliant_rate !== null && recentRow.non_compliant_rate !== undefined
    ? Number(recentRow.non_compliant_rate)
    : null;
  const previousAvgScore = previousRow.avg_score !== null && previousRow.avg_score !== undefined
    ? Number(previousRow.avg_score)
    : null;

  const trendDelta = avgScore !== null && previousAvgScore !== null
    ? avgScore - previousAvgScore
    : null;
  const trendLabel = getTrendLabel(trendDelta);

  await db.execute(sql`
    INSERT INTO l3_trend_snapshots (
      country,
      horizon_days,
      snapshot_date,
      window_start,
      window_end,
      checks_count,
      avg_score,
      non_compliant_rate,
      trend_delta,
      trend_label,
      generated_at,
      updated_at
    ) VALUES (
      ${country},
      ${horizonDays},
      CURRENT_DATE,
      NOW() - (${horizonDays} * INTERVAL '1 day'),
      NOW(),
      ${checksCount},
      ${avgScore},
      ${nonCompliantRate},
      ${trendDelta},
      ${trendLabel},
      ${now},
      ${now}
    )
    ON CONFLICT (country, horizon_days, snapshot_date)
    DO UPDATE SET
      window_start = EXCLUDED.window_start,
      window_end = EXCLUDED.window_end,
      checks_count = EXCLUDED.checks_count,
      avg_score = EXCLUDED.avg_score,
      non_compliant_rate = EXCLUDED.non_compliant_rate,
      trend_delta = EXCLUDED.trend_delta,
      trend_label = EXCLUDED.trend_label,
      generated_at = EXCLUDED.generated_at,
      updated_at = EXCLUDED.updated_at
  `);
}

export async function updateL3Trends(): Promise<void> {
  for (const country of COUNTRIES) {
    for (const horizon of HORIZONS) {
      await calculateAndStore(country, horizon);
    }
  }

  logger.info({ countries: COUNTRIES.length, horizons: HORIZONS }, 'L3 trend snapshots updated');
}
