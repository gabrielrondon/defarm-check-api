/**
 * Worker Service - Background Jobs com Node-Cron
 *
 * Roda na Railway como serviço separado da API
 * Executa cron jobs automaticamente e notifica via Telegram
 *
 * Deploy:
 *   Railway detecta e roda automaticamente via railway.json
 *
 * Logs:
 *   Railway Dashboard > Worker Service > Logs
 */

import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { telegram } from '../services/telegram.js';
import { setupScheduler } from './scheduler.js';

// Carregar variáveis de ambiente
dotenv.config();

async function main() {
  logger.info('='.repeat(60));
  logger.info('🤖 Worker Service Starting...');
  logger.info('='.repeat(60));

  // Verificar variáveis de ambiente críticas
  const requiredEnvVars = [
    'DATABASE_URL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID'
  ];

  const missing = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.error({ missing }, 'Missing required environment variables');
    process.exit(1);
  }

  // Testar conexão Telegram
  logger.info('Testing Telegram connection...');
  const telegramOk = await telegram.testConnection();

  if (!telegramOk) {
    logger.error('Failed to connect to Telegram. Notifications will not work.');
    // Continua mesmo assim (worker ainda pode executar jobs)
  }

  // Setup cron scheduler
  logger.info('Setting up cron scheduler...');
  const jobs = setupScheduler();

  logger.info('='.repeat(60));
  logger.info('✅ Worker Service Started Successfully');
  logger.info('='.repeat(60));
  logger.info({
    count: jobs.length,
    jobs: jobs.map(j => ({ name: j.name, schedule: j.schedule }))
  }, 'Scheduled jobs');

  // Enviar notificação de startup
  await telegram.sendMessage({
    text: '🚀 <b>Worker Service Iniciado</b>\n\n' +
      `✅ ${jobs.length} jobs agendados\n` +
      `🕐 ${new Date().toLocaleString('pt-BR')}\n\n` +
      'Sistema de atualização automática ativo!'
  });

  // Manter processo rodando
  logger.info('Worker running... Press Ctrl+C to stop');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  await telegram.sendMessage({
    text: '⏸️ <b>Worker Service Stopping</b>\n\n' +
      'Sistema de atualização será reiniciado em breve.'
  });

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Error handling
process.on('uncaughtException', async (error) => {
  logger.error({ err: error }, 'Uncaught exception');

  await telegram.notifyJobFailure('Worker Service', error.message);

  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error({ reason }, 'Unhandled rejection');

  await telegram.notifyJobFailure('Worker Service', String(reason));

  process.exit(1);
});

// Start worker
main().catch(async (error) => {
  logger.error({ err: error }, 'Worker failed to start');

  await telegram.notifyJobFailure('Worker Service Startup', error.message);

  process.exit(1);
});
