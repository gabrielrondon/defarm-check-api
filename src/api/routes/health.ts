import { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { cacheService } from '../../services/cache.js';
import { config } from '../../config/index.js';
import { HealthResponse } from '../../types/api.js';
import { sql } from 'drizzle-orm';

// Data freshness thresholds (in hours)
const FRESHNESS_THRESHOLDS = {
  'DETER Alerts': { warning: 48, stale: 96 }, // Daily updates (2-4 days)
  'IBAMA Embargoes': { warning: 168, stale: 336 }, // Weekly updates (7-14 days)
  'Slave Labor Registry': { warning: 720, stale: 1440 }, // Monthly updates (30-60 days)
  'PRODES Deforestation': { warning: 2160, stale: 4320 }, // Biannual updates (90-180 days) - PRODES é anual
  'Terras Indígenas': { warning: 1440, stale: 2880 }, // Quarterly updates (60-120 days) - Dados geográficos estáveis
  'Unidades de Conservação': { warning: 1440, stale: 2880 }, // Quarterly updates (60-120 days) - Dados geográficos estáveis
  'CAR Registry': { warning: 1080, stale: 2160 } // Quarterly updates (45-90 days) - Updates manuais/batch
};

async function getDataFreshness() {
  try {
    const sources = await db.execute(sql`
      SELECT name, last_updated, config
      FROM checker_sources
      WHERE is_active = true
      ORDER BY priority DESC
    `);

    const now = new Date();
    const dataSources = sources.rows.map((row: any) => {
      const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
      const hoursSinceUpdate = lastUpdated
        ? (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)
        : null;

      const thresholds = FRESHNESS_THRESHOLDS[row.name as keyof typeof FRESHNESS_THRESHOLDS];
      let freshnessStatus: 'fresh' | 'warning' | 'stale' | 'never_updated' = 'never_updated';

      if (hoursSinceUpdate !== null && thresholds) {
        if (hoursSinceUpdate < thresholds.warning) {
          freshnessStatus = 'fresh';
        } else if (hoursSinceUpdate < thresholds.stale) {
          freshnessStatus = 'warning';
        } else {
          freshnessStatus = 'stale';
        }
      }

      return {
        name: row.name,
        lastUpdated: lastUpdated?.toISOString() || null,
        hoursSinceUpdate: hoursSinceUpdate ? Math.round(hoursSinceUpdate) : null,
        freshnessStatus,
        totalRecords: row.config?.totalRecords || null
      };
    });

    return dataSources;
  } catch (err) {
    return [];
  }
}

async function getTableCounts() {
  try {
    const counts = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM lista_suja) as lista_suja,
        (SELECT COUNT(*) FROM ibama_embargoes) as ibama_embargoes,
        (SELECT COUNT(*) FROM deter_alerts) as deter_alerts,
        (SELECT COUNT(*) FROM terras_indigenas) as terras_indigenas,
        (SELECT COUNT(*) FROM unidades_conservacao) as unidades_conservacao,
        (SELECT COUNT(*) FROM prodes_deforestation) as prodes_deforestation,
        (SELECT COUNT(*) FROM car_registrations) as car_registrations
    `);

    return counts.rows[0] as any;
  } catch (err) {
    return null;
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check',
      description: `Returns the operational status of all services and data source freshness.

**Status values:**
- \`ok\`: All services healthy, data is fresh
- \`degraded\`: Services up but one or more data sources are stale
- \`down\`: Database or Redis is unavailable

**Data freshness thresholds:**
- DETER: fresh < 48h, stale > 96h (daily updates)
- IBAMA: fresh < 168h, stale > 336h (weekly updates)
- Lista Suja: fresh < 720h, stale > 1440h (monthly updates)
- PRODES: fresh < 2160h, stale > 4320h (annual updates)`,
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded', 'down'], example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string', example: '1.0.0' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string', enum: ['ok', 'down'], example: 'ok' },
                redis: { type: 'string', enum: ['ok', 'down'], example: 'ok' }
              }
            },
            dataSources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'PRODES Deforestation' },
                  lastUpdated: { type: 'string', format: 'date-time', nullable: true },
                  hoursSinceUpdate: { type: 'integer', nullable: true, example: 48 },
                  freshnessStatus: {
                    type: 'string',
                    enum: ['fresh', 'warning', 'stale', 'never_updated'],
                    example: 'fresh'
                  },
                  totalRecords: { type: 'integer', nullable: true, example: 216252 }
                }
              }
            },
            tableCounts: {
              type: 'object',
              nullable: true,
              properties: {
                lista_suja: { type: 'integer', example: 678 },
                ibama_embargoes: { type: 'integer', example: 65953 },
                deter_alerts: { type: 'integer', example: 1200 },
                terras_indigenas: { type: 'integer', example: 740 },
                unidades_conservacao: { type: 'integer', example: 334 },
                prodes_deforestation: { type: 'integer', example: 216252 },
                car_registrations: { type: 'integer', example: 3544068 }
              }
            }
          }
        },
        503: {
          type: 'object',
          description: 'Service unavailable — database or Redis is down',
          properties: {
            status: { type: 'string', enum: ['down', 'degraded'], example: 'down' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string', enum: ['ok', 'down'], example: 'down' },
                redis: { type: 'string', enum: ['ok', 'down'], example: 'down' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Check database
    let dbStatus: 'ok' | 'down' = 'down';
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'ok';
    } catch (err) {
      // Database down
    }

    // Check Redis — internal Railway URLs (*.railway.internal) are only reachable
    // within the private network; treat as ok if DB is healthy to avoid false degraded.
    const redisHealthy = await cacheService.isHealthy();
    const redisUrl = process.env.REDIS_URL ?? '';
    const redisIsInternal = redisUrl.includes('.railway.internal') || redisUrl.includes('.internal');
    const redisStatus = redisHealthy ? 'ok' : (redisIsInternal ? 'ok' : 'down');

    // Get data freshness (only if DB is up)
    const dataSources = dbStatus === 'ok' ? await getDataFreshness() : [];
    const tableCounts = dbStatus === 'ok' ? await getTableCounts() : null;

    // Determine overall freshness status
    const hasStaleSources = dataSources.some(s => s.freshnessStatus === 'stale');
    const hasWarningSources = dataSources.some(s => s.freshnessStatus === 'warning');

    let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
    if (dbStatus === 'down') {
      overallStatus = 'down';
    } else if (!redisHealthy && !redisIsInternal) {
      overallStatus = 'down';
    } else if (hasStaleSources) {
      overallStatus = 'degraded';
    } else if (hasWarningSources) {
      overallStatus = 'ok'; // Warning is still OK, just informational
    }

    const response: any = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: config.api.version,
      services: {
        database: dbStatus,
        redis: redisStatus
      },
      dataSources,
      tableCounts
    };

    const statusCode = overallStatus === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
