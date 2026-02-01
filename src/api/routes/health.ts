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
  'PRODES Deforestation': { warning: 720, stale: 1440 }, // Monthly updates
  'Terras Indígenas': { warning: 720, stale: 1440 }, // Monthly updates
  'Unidades de Conservação': { warning: 720, stale: 1440 }, // Monthly updates
  'CAR Registry': { warning: 720, stale: 1440 } // Monthly updates
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
      description: 'Health check endpoint with data freshness information'
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

    // Check Redis
    const redisStatus = await cacheService.isHealthy() ? 'ok' : 'down';

    // Get data freshness (only if DB is up)
    const dataSources = dbStatus === 'ok' ? await getDataFreshness() : [];
    const tableCounts = dbStatus === 'ok' ? await getTableCounts() : null;

    // Determine overall freshness status
    const hasStaleSources = dataSources.some(s => s.freshnessStatus === 'stale');
    const hasWarningSources = dataSources.some(s => s.freshnessStatus === 'warning');

    let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
    if (dbStatus === 'down' || redisStatus === 'down') {
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
