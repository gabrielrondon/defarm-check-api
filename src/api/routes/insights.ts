import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

const COUNTRY_ENUM = ['BR', 'UY', 'AR', 'PY', 'BO', 'CL', 'CO', 'PE'];
const HORIZON_ENUM = [7, 30, 90];

function buildL3Query(filters: {
  country?: string;
  horizon?: number;
  fromDate?: string;
  limit: number;
}) {
  const baseSelect = sql`
    SELECT
      country,
      horizon_days as "horizonDays",
      snapshot_date as "snapshotDate",
      checks_count as "checksCount",
      avg_score as "avgScore",
      non_compliant_rate as "nonCompliantRate",
      trend_delta as "trendDelta",
      trend_label as "trendLabel",
      generated_at as "generatedAt"
    FROM l3_trend_snapshots
  `;

  const { country, horizon, fromDate, limit } = filters;
  if (country && horizon && fromDate) {
    return sql`${baseSelect}
      WHERE country = ${country}
        AND horizon_days = ${horizon}
        AND snapshot_date >= ${fromDate}::date
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (country && horizon) {
    return sql`${baseSelect}
      WHERE country = ${country}
        AND horizon_days = ${horizon}
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (country && fromDate) {
    return sql`${baseSelect}
      WHERE country = ${country}
        AND snapshot_date >= ${fromDate}::date
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (horizon && fromDate) {
    return sql`${baseSelect}
      WHERE horizon_days = ${horizon}
        AND snapshot_date >= ${fromDate}::date
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (country) {
    return sql`${baseSelect}
      WHERE country = ${country}
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (horizon) {
    return sql`${baseSelect}
      WHERE horizon_days = ${horizon}
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }
  if (fromDate) {
    return sql`${baseSelect}
      WHERE snapshot_date >= ${fromDate}::date
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT ${limit}
    `;
  }

  return sql`${baseSelect}
    ORDER BY snapshot_date DESC, generated_at DESC
    LIMIT ${limit}
  `;
}

export async function insightsRoutes(app: FastifyInstance) {
  app.get('/insights/l3', {
    schema: {
      tags: ['insights'],
      summary: 'Get L3 trend snapshots',
      description: 'Returns latest L3 trend snapshots by country and horizon (7/30/90 days).',
      querystring: {
        type: 'object',
        properties: {
          country: { type: 'string', enum: COUNTRY_ENUM },
          horizon: { type: 'number', enum: HORIZON_ENUM },
          fromDate: { type: 'string', format: 'date' },
          limit: { type: 'number', minimum: 1, maximum: 365, default: 30 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              country: { type: 'string' },
              horizonDays: { type: 'number' },
              snapshotDate: { type: 'string' },
              checksCount: { type: 'number' },
              avgScore: { type: 'number' },
              nonCompliantRate: { type: 'number' },
              trendDelta: { type: 'number' },
              trendLabel: { type: 'string' },
              generatedAt: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { country, horizon, fromDate, limit = 30 } = request.query as {
      country?: string;
      horizon?: number;
      fromDate?: string;
      limit?: number;
    };

    const query = buildL3Query({ country, horizon, fromDate, limit });
    const rows = await db.execute(query);
    return reply.send(rows.rows);
  });

  app.get('/insights/l3/portfolio', {
    schema: {
      tags: ['insights'],
      summary: 'Get portfolio-level L3 summary',
      description: 'Returns latest aggregated portfolio snapshot and suggested audit queue size.',
      querystring: {
        type: 'object',
        properties: {
          country: { type: 'string', enum: COUNTRY_ENUM },
          horizon: { type: 'number', enum: HORIZON_ENUM, default: 30 }
        }
      }
    }
  }, async (request, reply) => {
    const { country = 'BR', horizon = 30 } = request.query as { country?: string; horizon?: number };

    const latestSnapshot = await db.execute(sql`
      SELECT
        country,
        horizon_days as "horizonDays",
        snapshot_date as "snapshotDate",
        checks_count as "checksCount",
        avg_score as "avgScore",
        non_compliant_rate as "nonCompliantRate",
        trend_delta as "trendDelta",
        trend_label as "trendLabel",
        generated_at as "generatedAt"
      FROM l3_trend_snapshots
      WHERE country = ${country}
        AND horizon_days = ${horizon}
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT 1
    `);

    const queue = await db.execute(sql`
      SELECT
        COUNT(*)::int as queue_size
      FROM check_requests
      WHERE country = ${country}
        AND created_at >= NOW() - (${horizon} * INTERVAL '1 day')
        AND (
          verdict = 'NON_COMPLIANT'
          OR COALESCE((summary->>'failed')::int, 0) > 0
        )
    `);

    return reply.send({
      snapshot: latestSnapshot.rows?.[0] || null,
      auditQueueSize: Number((queue.rows?.[0] as any)?.queue_size || 0),
      generatedAt: new Date().toISOString()
    });
  });

  app.get('/insights/l3/audit-queue', {
    schema: {
      tags: ['insights'],
      summary: 'Get suggested audit queue',
      description: 'Returns recent checks prioritized for manual audit.',
      querystring: {
        type: 'object',
        properties: {
          country: { type: 'string', enum: COUNTRY_ENUM },
          limit: { type: 'number', minimum: 1, maximum: 200, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    const { country = 'BR', limit = 20 } = request.query as { country?: string; limit?: number };
    const rows = await db.execute(sql`
      SELECT
        id as "checkId",
        country,
        verdict,
        score,
        created_at as "createdAt",
        COALESCE((summary->>'failed')::int, 0) as failed_count,
        COALESCE((summary->>'warnings')::int, 0) as warning_count
      FROM check_requests
      WHERE country = ${country}
        AND (
          verdict = 'NON_COMPLIANT'
          OR COALESCE((summary->>'failed')::int, 0) > 0
          OR score < 80
        )
      ORDER BY score ASC, created_at DESC
      LIMIT ${limit}
    `);

    const queue = rows.rows.map((row: any) => ({
      ...row,
      priority:
        Number(row.score) < 50 || Number(row.failed_count) >= 2
          ? 'HIGH'
          : Number(row.score) < 80 || Number(row.failed_count) > 0
            ? 'MEDIUM'
            : 'LOW',
      reason:
        Number(row.failed_count) > 0
          ? `${row.failed_count} failed checker(s)`
          : `low score ${row.score}`
    }));

    return reply.send(queue);
  });

  app.get('/insights/derived-rules', {
    schema: {
      tags: ['insights'],
      summary: 'Get derived rule trigger metrics',
      description: 'Returns aggregated trigger counts for derived cross-source rules.',
      querystring: {
        type: 'object',
        properties: {
          country: { type: 'string', enum: COUNTRY_ENUM },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ruleId: { type: 'string' },
              ruleName: { type: 'string' },
              triggerCount: { type: 'number' },
              affectedChecks: { type: 'number' },
              lastTriggeredAt: { type: 'string' },
              avgCheckScore: { type: 'number' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { country, fromDate, toDate, limit = 20 } = request.query as {
      country?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    };

    const filters = [];
    if (country) filters.push(sql`cr.country = ${country}`);
    if (fromDate) filters.push(sql`cr.created_at >= ${fromDate}::date`);
    if (toDate) filters.push(sql`cr.created_at < (${toDate}::date + INTERVAL '1 day')`);
    filters.push(sql`(r->'details'->>'ruleId') IS NOT NULL`);
    filters.push(sql`r->>'sourceType' = 'derived'`);

    const whereClause = filters.length
      ? sql`WHERE ${sql.join(filters, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        (r->'details'->>'ruleId')::text as "ruleId",
        (r->>'name')::text as "ruleName",
        COUNT(*)::int as "triggerCount",
        COUNT(DISTINCT cr.id)::int as "affectedChecks",
        MAX(cr.created_at) as "lastTriggeredAt",
        ROUND(AVG(cr.score)::numeric, 2)::float as "avgCheckScore"
      FROM check_requests cr
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cr.results, '[]'::jsonb)) r
      ${whereClause}
      GROUP BY 1, 2
      ORDER BY "triggerCount" DESC, "lastTriggeredAt" DESC
      LIMIT ${limit}
    `);

    return reply.send(rows.rows);
  });
}
