/**
 * Job: Atualização DETER (Alertas de Desmatamento)
 *
 * Frequência: DIÁRIA (03:00)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { telegram } from '../../services/telegram.js';
import { cacheService } from '../../services/cache.js';
import { updateDataSourceFreshness } from '../../utils/data-freshness.js';

const execAsync = promisify(exec);

function getDateRange() {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  return {
    start: sevenDaysAgo.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0]
  };
}

async function cleanOldAlerts() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const result = await db.execute(sql`
    DELETE FROM deter_alerts
    WHERE alert_date < ${cutoffStr}
  `);

  return result.rowCount || 0;
}

async function getNewAlertsStats() {
  const { start } = getDateRange();

  const result = await db.execute(sql`
    SELECT
      state,
      classname,
      COUNT(*) as count,
      SUM(area_ha) as total_area_ha
    FROM deter_alerts
    WHERE alert_date >= ${start}
    GROUP BY state, classname
    ORDER BY count DESC
  `);

  return result.rows;
}

export async function updateDETER(): Promise<void> {
  const { start, end } = getDateRange();

  logger.info(`Downloading DETER alerts from ${start} to ${end}`);

  // Download
  await execAsync(`tsx scripts/download-deter.ts ${start} ${end}`);

  // Seed
  const filepath = `data/deter_alerts_${end}.json`;
  await execAsync(`tsx scripts/seed-deter.ts ${filepath}`);

  // Clean old
  const deleted = await cleanOldAlerts();
  logger.info(`Cleaned ${deleted} old alerts`);

  // Stats
  const stats: any[] = await getNewAlertsStats();

  // Notificar alertas CRÍTICOS
  const criticalAlerts = stats.filter((s: any) =>
    s.classname?.includes('DESMATAMENTO') && s.count > 5
  );

  for (const alert of criticalAlerts) {
    await telegram.notifyDeterCriticalAlerts(
      alert.state,
      alert.count,
      alert.total_area_ha
    );
  }

  // Invalidar cache de DETER (dados foram atualizados)
  const invalidated = await cacheService.invalidateChecker('PRODES Deforestation');
  logger.info({ invalidated }, 'DETER cache invalidated');

  // Update data source freshness
  const totalNewAlerts = stats.reduce((sum: number, s: any) => sum + Number(s.count), 0);
  const totalCount = await db.execute(sql`SELECT COUNT(*) as count FROM deter_alerts`);
  await updateDataSourceFreshness('PRODES Deforestation', {
    totalRecords: Number(totalCount.rows[0]?.count || 0),
    lastUpdateAlerts: totalNewAlerts
  });

  logger.info({
    newAlerts: totalNewAlerts,
    criticalAlerts: criticalAlerts.length
  }, 'DETER update completed');
}
