/**
 * Satellite Checker Persistent Cache Service
 *
 * Armazena permanentemente os resultados dos satellite checkers no PostgreSQL,
 * com histórico completo e TTL gerenciado pela aplicação.
 *
 * Arquitetura de cache em camadas:
 *   L1 → Redis        (volátil, ~5ms,  TTL curto)
 *   L2 → PostgreSQL   (permanente, ~10ms, TTL gerenciado)
 *   L3 → API externa  (lento, 1-10s, fonte da verdade)
 *
 * Permite:
 *  - Ver histórico de resultados por CAR/coordenada
 *  - Saber quando o dado foi consultado e quando expira
 *  - Job de refresh proativo (buscar dados antes de expirarem)
 *  - Auditoria completa de todas as consultas satélite
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { CheckerResult } from '../types/checker.js';

export interface SatelliteCacheEntry {
  id: string;
  inputType: string;
  inputValue: string;
  checkerName: string;
  status: string;
  severity: string | null;
  message: string | null;
  resultJson: CheckerResult;
  ttlSeconds: number;
  fetchedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
  createdAt: Date;
}

export interface SatelliteCacheHistory {
  checkerName: string;
  fetchedAt: Date;
  expiresAt: Date;
  status: string;
  message: string | null;
  isExpired: boolean;
}

class SatelliteCacheService {

  /**
   * Busca resultado atual (não expirado) para um input + checker.
   * Retorna null se não houver entrada ou se estiver expirado.
   */
  async get(
    inputType: string,
    inputValue: string,
    checkerName: string
  ): Promise<CheckerResult | null> {
    try {
      const rows = await db.execute<{
        result_json: CheckerResult;
        fetched_at: Date;
        expires_at: Date;
      }>(sql`
        SELECT result_json, fetched_at, expires_at
        FROM satellite_checker_results
        WHERE input_value  = ${inputValue}
          AND checker_name = ${checkerName}
          AND is_current   = true
          AND expires_at   > NOW()
        ORDER BY fetched_at DESC
        LIMIT 1
      `);

      const row = rows.rows?.[0];
      if (!row) return null;

      logger.debug(
        { inputValue, checkerName, fetchedAt: row.fetched_at, expiresAt: row.expires_at },
        'Satellite cache HIT (PostgreSQL)'
      );

      return { ...(row.result_json as CheckerResult), cached: true };
    } catch (err) {
      logger.warn({ err, inputValue, checkerName }, 'Satellite cache get failed — falling through to API');
      return null;
    }
  }

  /**
   * Salva resultado no PostgreSQL.
   * Marca entradas anteriores como is_current = false (preserva histórico).
   */
  async set(
    inputType: string,
    inputValue: string,
    checkerName: string,
    result: CheckerResult,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const now        = new Date();
      const expiresAt  = new Date(now.getTime() + ttlSeconds * 1000);

      await db.transaction(async (tx) => {
        // Marca entradas anteriores como não-current (preserva histórico)
        await tx.execute(sql`
          UPDATE satellite_checker_results
          SET is_current = false
          WHERE input_value  = ${inputValue}
            AND checker_name = ${checkerName}
            AND is_current   = true
        `);

        // Insere novo resultado
        await tx.execute(sql`
          INSERT INTO satellite_checker_results
            (input_type, input_value, checker_name, status, severity, message,
             result_json, ttl_seconds, fetched_at, expires_at, is_current)
          VALUES (
            ${inputType},
            ${inputValue},
            ${checkerName},
            ${result.status},
            ${result.severity ?? null},
            ${result.message ?? null},
            ${JSON.stringify(result)},
            ${ttlSeconds},
            ${now.toISOString()},
            ${expiresAt.toISOString()},
            true
          )
        `);
      });

      logger.debug(
        { inputValue, checkerName, ttlSeconds, expiresAt },
        'Satellite result persisted to PostgreSQL'
      );
    } catch (err) {
      // Cache write failure is non-fatal — log and continue
      logger.warn({ err, inputValue, checkerName }, 'Satellite cache set failed — result not persisted');
    }
  }

  /**
   * Retorna histórico completo de resultados para um input + checker.
   * Útil para ver evolução ao longo do tempo.
   */
  async getHistory(
    inputValue: string,
    checkerName: string,
    limit = 20
  ): Promise<SatelliteCacheHistory[]> {
    try {
      const rows = await db.execute<{
        checker_name: string;
        fetched_at: Date;
        expires_at: Date;
        status: string;
        message: string | null;
      }>(sql`
        SELECT checker_name, fetched_at, expires_at, status, message
        FROM satellite_checker_results
        WHERE input_value  = ${inputValue}
          AND checker_name = ${checkerName}
        ORDER BY fetched_at DESC
        LIMIT ${limit}
      `);

      return (rows.rows ?? []).map(r => ({
        checkerName: r.checker_name,
        fetchedAt:   new Date(r.fetched_at),
        expiresAt:   new Date(r.expires_at),
        status:      r.status,
        message:     r.message,
        isExpired:   new Date(r.expires_at) < new Date()
      }));
    } catch (err) {
      logger.warn({ err, inputValue, checkerName }, 'Satellite cache history query failed');
      return [];
    }
  }

  /**
   * Retorna todos os checkers que já rodaram para um dado input.
   * Útil para saber o estado completo de uma propriedade/coordenada.
   */
  async getSummary(inputValue: string): Promise<Array<{
    checkerName: string;
    status: string;
    fetchedAt: Date;
    expiresAt: Date;
    isExpired: boolean;
  }>> {
    try {
      const rows = await db.execute<{
        checker_name: string;
        status: string;
        fetched_at: Date;
        expires_at: Date;
      }>(sql`
        SELECT checker_name, status, fetched_at, expires_at
        FROM satellite_checker_results
        WHERE input_value = ${inputValue}
          AND is_current  = true
        ORDER BY checker_name
      `);

      return (rows.rows ?? []).map(r => ({
        checkerName: r.checker_name,
        status:      r.status,
        fetchedAt:   new Date(r.fetched_at),
        expiresAt:   new Date(r.expires_at),
        isExpired:   new Date(r.expires_at) < new Date()
      }));
    } catch (err) {
      logger.warn({ err, inputValue }, 'Satellite cache summary query failed');
      return [];
    }
  }

  /**
   * Retorna entradas expiradas (is_current = true, expires_at < NOW()).
   * Usado por jobs de refresh proativo.
   */
  async getExpired(limit = 100): Promise<Array<{
    inputType: string;
    inputValue: string;
    checkerName: string;
    expiresAt: Date;
    fetchedAt: Date;
  }>> {
    try {
      const rows = await db.execute<{
        input_type: string;
        input_value: string;
        checker_name: string;
        expires_at: Date;
        fetched_at: Date;
      }>(sql`
        SELECT input_type, input_value, checker_name, expires_at, fetched_at
        FROM satellite_checker_results
        WHERE is_current  = true
          AND expires_at  < NOW()
        ORDER BY expires_at ASC
        LIMIT ${limit}
      `);

      return (rows.rows ?? []).map(r => ({
        inputType:   r.input_type,
        inputValue:  r.input_value,
        checkerName: r.checker_name,
        expiresAt:   new Date(r.expires_at),
        fetchedAt:   new Date(r.fetched_at)
      }));
    } catch (err) {
      logger.warn({ err }, 'Satellite cache getExpired query failed');
      return [];
    }
  }

  /**
   * Estatísticas do cache para monitoramento/health check.
   */
  async getStats(): Promise<{
    totalEntries: number;
    currentEntries: number;
    expiredEntries: number;
    checkerBreakdown: Array<{ checkerName: string; count: number; expiredCount: number }>;
  }> {
    try {
      const [totals, breakdown] = await Promise.all([
        db.execute<{ total: string; current: string; expired: string }>(sql`
          SELECT
            COUNT(*)                                          AS total,
            COUNT(*) FILTER (WHERE is_current = true)        AS current,
            COUNT(*) FILTER (WHERE is_current = true AND expires_at < NOW()) AS expired
          FROM satellite_checker_results
        `),
        db.execute<{ checker_name: string; cnt: string; expired_cnt: string }>(sql`
          SELECT
            checker_name,
            COUNT(*)                                          AS cnt,
            COUNT(*) FILTER (WHERE expires_at < NOW())       AS expired_cnt
          FROM satellite_checker_results
          WHERE is_current = true
          GROUP BY checker_name
          ORDER BY checker_name
        `)
      ]);

      const t = totals.rows?.[0];
      return {
        totalEntries:   parseInt(t?.total ?? '0'),
        currentEntries: parseInt(t?.current ?? '0'),
        expiredEntries: parseInt(t?.expired ?? '0'),
        checkerBreakdown: (breakdown.rows ?? []).map(r => ({
          checkerName:  r.checker_name,
          count:        parseInt(r.cnt),
          expiredCount: parseInt(r.expired_cnt)
        }))
      };
    } catch (err) {
      logger.warn({ err }, 'Satellite cache stats query failed');
      return { totalEntries: 0, currentEntries: 0, expiredEntries: 0, checkerBreakdown: [] };
    }
  }
}

export const satelliteCacheService = new SatelliteCacheService();
