import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

const COUNTRY_ENUM = ['BR', 'UY', 'AR', 'PY', 'BO', 'CL', 'CO', 'PE'];
const HORIZON_ENUM = [7, 30, 90];

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
    const { country, horizon, limit = 30 } = request.query as {
      country?: string;
      horizon?: number;
      limit?: number;
    };

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

    let query;
    if (country && horizon) {
      query = sql`${baseSelect}
        WHERE country = ${country}
          AND horizon_days = ${horizon}
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT ${limit}
      `;
    } else if (country) {
      query = sql`${baseSelect}
        WHERE country = ${country}
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT ${limit}
      `;
    } else if (horizon) {
      query = sql`${baseSelect}
        WHERE horizon_days = ${horizon}
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT ${limit}
      `;
    } else {
      query = sql`${baseSelect}
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT ${limit}
      `;
    }

    const rows = await db.execute(query);

    return reply.send(rows.rows);
  });
}
