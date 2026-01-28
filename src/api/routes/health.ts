import { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { cacheService } from '../../services/cache.js';
import { config } from '../../config/index.js';
import { HealthResponse } from '../../types/api.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      tags: ['health'],
      description: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' }
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
      await db.execute('SELECT 1' as any);
      dbStatus = 'ok';
    } catch (err) {
      // Database down
    }

    // Check Redis
    const redisStatus = await cacheService.isHealthy() ? 'ok' : 'down';

    const overallStatus = dbStatus === 'ok' && redisStatus === 'ok'
      ? 'ok'
      : dbStatus === 'ok' || redisStatus === 'ok'
        ? 'degraded'
        : 'down';

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: config.api.version,
      services: {
        database: dbStatus,
        redis: redisStatus
      }
    };

    const statusCode = overallStatus === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
