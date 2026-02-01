#!/usr/bin/env tsx
/**
 * Cron Job: Atualização do CAR (Cadastro Ambiental Rural)
 *
 * Frequência: MENSAL (dia 15, 03:00)
 * Cron: 0 3 15 * *
 *
 * O que faz:
 * 1. Download CAR dos estados PRIORITÁRIOS (10 principais)
 * 2. Seed incremental (upsert)
 * 3. Log de mudanças de status (novos ATIVOS, novos CANCELADOS)
 * 4. Notificação se mudanças significativas
 *
 * Estados prioritários: MT, PA, GO, MS, RS, PR, SP, MG, BA, TO
 * (~90% do agronegócio brasileiro)
 *
 * NOTA: Update completo de todos 27 estados seria muito pesado.
 * Rodamos apenas prioritários mensalmente.
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
      filename: 'logs/cron-car.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

async function downloadPriorityStates() {
  logger.info('Downloading CAR for priority states...');

  try {
    // Download apenas estados prioritários
    await execAsync('npm run data:car-all -- --priority');
    logger.info('CAR download completed');
  } catch (error) {
    logger.error('CAR download failed', { error });
    throw error;
  }
}

async function seedAllStates() {
  logger.info('Seeding CAR data to database...');

  try {
    // Seed todos os arquivos encontrados
    await execAsync('npm run seed:car-all');
    logger.info('CAR seed completed');
  } catch (error) {
    logger.error('CAR seed failed', { error });
    throw error;
  }
}

async function getStatusChanges() {
  // Estatísticas de status por estado
  const result = await db.execute(sql`
    SELECT
      state,
      status,
      COUNT(*) as count
    FROM car_registrations
    GROUP BY state, status
    ORDER BY state, count DESC
  `);

  return result.rows;
}

async function detectCriticalChanges() {
  // Detectar se houve aumento significativo de CAR cancelados/suspensos
  const result = await db.execute(sql`
    SELECT
      state,
      COUNT(*) FILTER (WHERE status = 'CANCELADO') as cancelados,
      COUNT(*) FILTER (WHERE status = 'SUSPENSO') as suspensos,
      COUNT(*) FILTER (WHERE status = 'ATIVO') as ativos,
      COUNT(*) FILTER (WHERE status = 'PENDENTE') as pendentes
    FROM car_registrations
    GROUP BY state
    ORDER BY state
  `);

  const critical = result.rows.filter((r: any) => {
    // Considerar crítico se > 5% cancelados ou suspensos
    const total = r.ativos + r.cancelados + r.suspensos + r.pendentes;
    const irregulares = r.cancelados + r.suspensos;
    const percentIrregular = (irregulares / total) * 100;

    return percentIrregular > 5;
  });

  return critical;
}

async function main() {
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('Starting CAR update job (priority states only)');
  logger.info('='.repeat(60));

  try {
    // 1. Download estados prioritários
    await downloadPriorityStates();

    // 2. Seed no banco (upsert)
    await seedAllStates();

    // 3. Estatísticas
    const statusChanges = await getStatusChanges();
    const criticalChanges = await detectCriticalChanges();

    const executionTime = Math.round((Date.now() - startTime) / 1000);

    logger.info('='.repeat(60));
    logger.info('CAR update completed successfully', {
      executionTimeSeconds: executionTime,
      statusSummary: statusChanges.length + ' state/status combinations',
      criticalStates: criticalChanges.length
    });
    logger.info('='.repeat(60));

    // TODO: Notificar Telegram se mudanças críticas
    if (criticalChanges.length > 0) {
      logger.warn('CRITICAL: States with >5% irregular CAR detected', {
        states: criticalChanges
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error('CAR update failed', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as updateCAR };
