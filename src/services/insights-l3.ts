import { sql } from 'drizzle-orm';
import { CheckStatus, Severity } from '../types/checker.js';
import { L3Insights, L3Signal } from '../types/insights.js';
import { SourceResult } from '../types/verdict.js';
import { Country } from '../types/input.js';
import { db } from '../db/client.js';
import { logger } from '../utils/logger.js';

function getAuditPriority(score: number, criticalFails: number, failCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (criticalFails > 0 || score < 50) return 'HIGH';
  if (failCount > 0 || score < 80) return 'MEDIUM';
  return 'LOW';
}

async function getTrendLabel(country: Country, horizonDays: 30 | 90 = 30): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT trend_label
      FROM l3_trend_snapshots
      WHERE country = ${country}
        AND horizon_days = ${horizonDays}
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) return 'UNKNOWN';
    return String((result.rows[0] as any).trend_label || 'UNKNOWN');
  } catch (err) {
    logger.warn({ err, country, horizonDays }, 'Failed to fetch L3 trend label snapshot');
    return 'UNKNOWN';
  }
}

export async function deriveL3Insights(
  country: Country,
  score: number,
  results: SourceResult[]
): Promise<L3Insights> {
  const failCount = results.filter(r => r.status === CheckStatus.FAIL).length;
  const warningCount = results.filter(r => r.status === CheckStatus.WARNING).length;
  const criticalFails = results.filter(
    r => r.status === CheckStatus.FAIL && r.severity === Severity.CRITICAL
  ).length;

  const trend30d = await getTrendLabel(country, 30);
  const auditPriority = getAuditPriority(score, criticalFails, failCount);
  const hotspot = criticalFails > 0 || failCount >= 3;

  const signals: L3Signal[] = [
    {
      id: 'audit_priority',
      label: 'Audit Priority',
      value: auditPriority,
      horizon: '30d',
      confidence: 0.9
    },
    {
      id: 'hotspot_signal',
      label: 'Hotspot Signal',
      value: hotspot,
      horizon: '30d',
      confidence: 0.85
    },
    {
      id: 'risk_trend_30d',
      label: 'Risk Trend 30d',
      value: trend30d,
      horizon: '30d',
      confidence: trend30d === 'UNKNOWN' ? 0.2 : 0.75
    },
    {
      id: 'critical_fail_count',
      label: 'Critical Fail Count',
      value: criticalFails,
      horizon: '7d',
      confidence: 1
    },
    {
      id: 'warning_count',
      label: 'Warning Count',
      value: warningCount,
      horizon: '7d',
      confidence: 1
    }
  ];

  return {
    version: '1.0.0',
    signals
  };
}
