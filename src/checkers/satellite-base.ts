/**
 * SatelliteBaseChecker
 *
 * Estende BaseChecker com cache persistente em PostgreSQL (L2).
 * Todos os satellite checkers devem estender esta classe.
 *
 * Camadas de cache:
 *   L1 → Redis (herdado do BaseChecker) — volátil, ~5ms
 *   L2 → PostgreSQL (via satelliteCacheService) — permanente, ~10ms
 *   L3 → API externa — lento, 1-10s, fonte da verdade
 *
 * Fluxo de check():
 *   1. Redis HIT → retorna imediatamente (cached: true)
 *   2. Redis MISS → consulta PostgreSQL
 *      2a. PostgreSQL HIT (não expirado) → popula Redis → retorna (cached: true)
 *      2b. PostgreSQL MISS ou expirado → chama API
 *          → salva em PostgreSQL (com histórico)
 *          → salva em Redis
 *          → retorna resultado fresco (cached: false)
 */

import { BaseChecker } from './base.js';
import { NormalizedInput } from '../types/input.js';
import { CheckerResult, CheckStatus } from '../types/checker.js';
import { cacheService } from '../services/cache.js';
import { satelliteCacheService } from '../services/satellite-cache.js';
import { logger } from '../utils/logger.js';

export abstract class SatelliteBaseChecker extends BaseChecker {

  async check(input: NormalizedInput): Promise<CheckerResult> {
    const startTime = Date.now();

    try {
      if (!this.isApplicable(input)) {
        return this.notApplicableResult();
      }

      const cacheKey = input.value;

      // --- L1: Redis cache ---
      if (this.config.enabled && cacheKey) {
        const redisHit = await cacheService.get<CheckerResult>(
          input.type, cacheKey, this.metadata.name
        );
        if (redisHit) {
          logger.debug({ checker: this.metadata.name, key: cacheKey }, 'L1 Redis HIT');
          return { ...redisHit, cached: true, executionTimeMs: Date.now() - startTime };
        }
      }

      // --- L2: PostgreSQL persistent cache ---
      if (cacheKey) {
        const pgHit = await satelliteCacheService.get(input.type, cacheKey, this.metadata.name);
        if (pgHit) {
          logger.debug({ checker: this.metadata.name, key: cacheKey }, 'L2 PostgreSQL HIT');

          // Popula Redis para próximas chamadas rápidas
          if (this.config.enabled) {
            await cacheService.set(
              input.type, cacheKey, this.metadata.name, pgHit, this.config.cacheTTL
            );
          }

          return { ...pgHit, cached: true, executionTimeMs: Date.now() - startTime };
        }
      }

      // --- L3: API externa ---
      logger.debug({ checker: this.metadata.name, key: cacheKey }, 'L1+L2 MISS — calling external API');

      const result = await this.withTimeout(
        this.executeCheck(input),
        this.config.timeout
      );

      const finalResult = { ...result, executionTimeMs: Date.now() - startTime, cached: false };

      // Persiste em ambas as camadas (não-bloqueante)
      if (this.config.enabled && cacheKey && finalResult.status !== CheckStatus.ERROR) {
        const ttl = this.config.cacheTTL ?? 86400;

        // L2: PostgreSQL (permanente + histórico)
        satelliteCacheService.set(
          input.type, cacheKey, this.metadata.name, finalResult, ttl
        ).catch(err => logger.warn({ err, checker: this.metadata.name }, 'PostgreSQL cache write failed'));

        // L1: Redis (rápido)
        cacheService.set(
          input.type, cacheKey, this.metadata.name, finalResult, ttl
        ).catch(err => logger.warn({ err, checker: this.metadata.name }, 'Redis cache write failed'));
      }

      return finalResult;

    } catch (err) {
      logger.error({ err, checker: this.metadata.name }, 'Satellite checker execution error');
      return this.errorResult(err as Error, Date.now() - startTime);
    }
  }
}
