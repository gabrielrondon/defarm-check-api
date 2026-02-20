/**
 * Worker job: Satellite Cache Cleanup
 *
 * - Marca como is_current=false entradas expiradas (expires_at < NOW())
 * - Deleta entradas históricas com mais de 1 ano
 *
 * Schedule: Semanal (domingo, 03:00)
 */

import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { sendTelegramNotification } from '../../services/telegram.js';

export async function cleanupSatelliteCache(): Promise<void> {
  const jobName = 'Satellite Cache Cleanup';
  const startTime = Date.now();

  logger.info('Starting satellite cache cleanup job...');

  try {
    await sendTelegramNotification('🛰️', jobName, 'started');

    // 1. Mark expired current entries as not current
    const expiredResult = await db.execute(sql`
      UPDATE satellite_checker_results
      SET is_current = false
      WHERE is_current = true
        AND expires_at < NOW()
    `);
    const expiredCount = expiredResult.rowCount ?? 0;
    logger.info({ expiredCount }, 'Marked expired entries as not current');

    // 2. Delete historical entries older than 1 year
    const deleteResult = await db.execute(sql`
      DELETE FROM satellite_checker_results
      WHERE is_current = false
        AND fetched_at < NOW() - INTERVAL '1 year'
    `);
    const deletedCount = deleteResult.rowCount ?? 0;
    logger.info({ deletedCount }, 'Deleted old satellite cache entries');

    // 3. Get current stats
    const statsResult = await db.execute<{ total: string; current: string; expired_current: string }>(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_current = true) AS current,
        COUNT(*) FILTER (WHERE is_current = true AND expires_at < NOW()) AS expired_current
      FROM satellite_checker_results
    `);
    const stats = statsResult.rows[0];

    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));

    await sendTelegramNotification('✅', jobName, 'success', {
      duration,
      stats: {
        expired_marked: expiredCount,
        old_deleted: deletedCount,
        total_remaining: stats?.total,
        current_valid: stats?.current
      }
    });

    logger.info({ duration, expiredCount, deletedCount, stats }, 'Satellite cache cleanup completed');
  } catch (error: any) {
    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
    logger.error({ error, duration }, 'Satellite cache cleanup failed');
    await sendTelegramNotification('❌', jobName, 'failed', { error: error.message });
    throw error;
  }
}
