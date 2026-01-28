import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '../../config/index.js';

export async function securityPlugin(app: FastifyInstance) {
  // CORS
  await app.register(cors, {
    origin: config.env === 'production' ? false : true,
    credentials: true
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: config.env === 'production'
  });

  // Rate limiting (in-memory, para produção usar Redis store)
  await app.register(rateLimit, {
    max: config.security.rateLimitMax,
    timeWindow: config.security.rateLimitWindow
    // Para usar Redis, descomentar e passar instância IORedis:
    // redis: redisClient
  });
}
