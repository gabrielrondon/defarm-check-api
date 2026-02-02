import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',

  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0'
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/check_api'
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD
  },

  security: {
    apiSecret: process.env.API_SECRET || 'dev-secret-key',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10)
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    defaultTTL: parseInt(process.env.DEFAULT_CACHE_TTL || '3600', 10)
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true'
  },

  api: {
    version: '1.0.0'
  },

  geocoding: {
    provider: process.env.GEOCODING_PROVIDER || 'nominatim', // 'nominatim' or 'google'
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY, // Optional, for Google Maps fallback
    cacheTTL: parseInt(process.env.GEOCODING_CACHE_TTL || '31536000', 10), // 1 year
    rateLimit: parseInt(process.env.GEOCODING_RATE_LIMIT || '1', 10) // requests per second
  }
};
