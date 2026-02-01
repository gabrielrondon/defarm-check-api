import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { CacheError } from '../utils/errors.js';

class CacheService {
  private client: Redis;
  private connected: boolean = false;

  constructor() {
    this.client = new Redis(config.redis.url, {
      password: config.redis.password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.client.on('connect', () => {
      this.connected = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      logger.error({ err }, 'Redis connection error');
    });
  }

  // Gera chave de cache
  private generateKey(inputType: string, normalizedValue: string, checkerName: string): string {
    return `cache:check:${inputType}:${normalizedValue}:${checkerName}`;
  }

  // Get do cache
  async get<T>(inputType: string, normalizedValue: string, checkerName: string): Promise<T | null> {
    if (!config.cache.enabled || !this.connected) {
      return null;
    }

    try {
      const key = this.generateKey(inputType, normalizedValue, checkerName);
      const cached = await this.client.get(key);

      if (!cached) {
        return null;
      }

      logger.debug({ key }, 'Cache hit');
      return JSON.parse(cached) as T;
    } catch (err) {
      logger.warn({ err }, 'Cache get error');
      return null;
    }
  }

  // Set no cache
  async set(
    inputType: string,
    normalizedValue: string,
    checkerName: string,
    data: any,
    ttl: number = config.cache.defaultTTL
  ): Promise<void> {
    if (!config.cache.enabled || !this.connected) {
      return;
    }

    try {
      const key = this.generateKey(inputType, normalizedValue, checkerName);
      await this.client.setex(key, ttl, JSON.stringify(data));
      logger.debug({ key, ttl }, 'Cache set');
    } catch (err) {
      logger.warn({ err }, 'Cache set error');
    }
  }

  // Invalidate cache para um input específico
  async invalidate(inputType: string, normalizedValue: string, checkerName?: string): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      const pattern = checkerName
        ? this.generateKey(inputType, normalizedValue, checkerName)
        : `cache:check:${inputType}:${normalizedValue}:*`;

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info({ count: keys.length }, 'Cache invalidated');
      }
    } catch (err) {
      logger.warn({ err }, 'Cache invalidate error');
    }
  }

  // Invalidate ALL cache for a specific checker (quando dados são atualizados)
  async invalidateChecker(checkerName: string): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const pattern = `cache:check:*:*:${checkerName}`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info({ checker: checkerName, count: keys.length }, 'Checker cache invalidated');
        return keys.length;
      }

      return 0;
    } catch (err) {
      logger.warn({ err, checker: checkerName }, 'Checker cache invalidate error');
      return 0;
    }
  }

  // Invalidate ALL cache (nuclear option - use com cuidado!)
  async invalidateAll(): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const pattern = `cache:check:*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.warn({ count: keys.length }, 'ALL cache invalidated');
        return keys.length;
      }

      return 0;
    } catch (err) {
      logger.error({ err }, 'Cache invalidateAll error');
      return 0;
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Close connection
  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis connection closed');
  }
}

export const cacheService = new CacheService();
