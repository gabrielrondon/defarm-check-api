#!/usr/bin/env tsx
/**
 * Cron Job: Atualização dos Alertas DETER
 *
 * Frequência: DIÁRIA (03:00)
 * Cron: 0 3 * * *
 *
 * O que faz:
 * 1. Download apenas alertas dos últimos 7 dias (incremental)
 * 2. Insert novos alertas (evita duplicação por data)
 * 3. Limpa alertas > 90 dias (mantém janela relevante)
 * 4. Log de novos alertas por estado
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';

const execAsync = promisify(exec);

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
          return `[${ts}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({
      filename: 'logs/cron-deter.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

function getDateRange() {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  return {
    start: sevenDaysAgo.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0]
  };
}

async function downloadRecentAlerts(): Promise<string> {
  const { start, end } = getDateRange();

  logger.info(`Downloading DETER alerts from ${start} to ${end}...`);

  try {
    const downloadCmd = `tsx scripts/download-deter.ts ${start} ${end}`;
    await execAsync(downloadCmd);

    return `data/deter_alerts_${end}.json`;
  } catch (error) {
    logger.error('Download failed', { error });
    throw error;
  }
}

async function seedNewAlerts(filepath: string) {
  logger.info('Seeding new DETER alerts...');

  try {
    const seedCmd = `tsx scripts/seed-deter.ts ${filepath}`;
    await execAsync(seedCmd);
  } catch (error) {
    logger.error('Seed failed', { error });
    throw error;
  }
}

async function cleanOldAlerts() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  logger.info(`Cleaning DETER alerts older than ${cutoffStr}...`);

  const result = await db.execute(sql`
    DELETE FROM deter_alerts
    WHERE alert_date < ${cutoffStr}
  `);

  logger.info(`Cleaned old alerts`, { deleted: result.rowCount || 0 });
}

async function getNewAlertsStats() {
  const { start } = getDateRange();

  const result = await db.execute(sql`
    SELECT
      state,
      COUNT(*) as count,
      SUM(area_ha) as total_area_ha,
      classname
    FROM deter_alerts
    WHERE alert_date >= ${start}
    GROUP BY state, classname
    ORDER BY count DESC
  `);

  return result.rows;
}

async function main() {
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('Starting DETER alerts update job');
  logger.info('='.repeat(60));

  try {
    // 1. Download alertas recentes (últimos 7 dias)
    const filepath = await downloadRecentAlerts();

    // 2. Seed no banco
    await seedNewAlerts(filepath);

    // 3. Limpar alertas antigos (> 90 dias)
    await cleanOldAlerts();

    // 4. Estatísticas de novos alertas
    const stats = await getNewAlertsStats();
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    logger.info('='.repeat(60));
    logger.info('DETER alerts update completed successfully', {
      executionTimeSeconds: executionTime,
      newAlerts: stats
    });
    logger.info('='.repeat(60));

    // TODO: Notificar Telegram se alertas CRÍTICOS (DESMATAMENTO_VEG recentes)
    const criticalAlerts = stats.filter((s: any) =>
      s.classname?.includes('DESMATAMENTO') && s.count > 10
    );

    if (criticalAlerts.length > 0) {
      logger.warn('CRITICAL deforestation alerts detected', { criticalAlerts });
    }

    process.exit(0);
  } catch (error) {
    logger.error('DETER update failed', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as updateDeter };
