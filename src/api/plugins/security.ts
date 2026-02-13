import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '../../config/index.js';

export async function securityPlugin(app: FastifyInstance) {
  // CORS - Allow specific domains in production
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g., mobile apps, Postman)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Allowed domains (wildcards supported via regex)
      const allowedDomains = [
        /^https:\/\/.*\.lovableproject\.com$/,
        /^https:\/\/.*\.lovable\.app$/,
        /^http:\/\/localhost(:\d+)?$/,
        /^https:\/\/defarm-check-api-production\.up\.railway\.app$/,
        /^https:\/\/defarm\.net$/,
        /^https:\/\/www\.defarm\.net$/
      ];

      // Check if origin matches any allowed domain
      const isAllowed = allowedDomains.some(domain => domain.test(origin));

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
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
