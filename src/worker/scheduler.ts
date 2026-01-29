/**
 * Cron Scheduler - Configuração de todos os jobs
 *
 * Usa node-cron para agendar execuções automáticas
 */

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { telegram } from '../services/telegram.js';

// Import job handlers
import { updateDETER } from './jobs/update-deter.js';
import { updateListaSuja } from './jobs/update-lista-suja.js';
import { updateIbama } from './jobs/update-ibama.js';
import { updateSpatialData } from './jobs/update-spatial-data.js';
import { updateCAR } from './jobs/update-car.js';
import { checkDataFreshness } from './jobs/check-data-freshness.js';

interface ScheduledJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

const JOBS: ScheduledJob[] = [
  {
    name: 'DETER Alerts',
    schedule: '0 3 * * *',  // Diária, 03:00
    handler: updateDETER,
    enabled: true
  },
  {
    name: 'Lista Suja',
    schedule: '0 2 1 * *',  // Mensal (dia 1), 02:00
    handler: updateListaSuja,
    enabled: true
  },
  {
    name: 'IBAMA Embargoes',
    schedule: '0 2 * * 0',  // Semanal (domingo), 02:00
    handler: updateIbama,
    enabled: true
  },
  {
    name: 'Spatial Data (TIs + UCs)',
    schedule: '0 4 1 * *',  // Mensal (dia 1), 04:00
    handler: updateSpatialData,
    enabled: true
  },
  {
    name: 'CAR (Priority States)',
    schedule: '0 3 15 * *',  // Mensal (dia 15), 03:00
    handler: updateCAR,
    enabled: true
  },
  {
    name: 'Data Freshness Check',
    schedule: '0 8 * * *',  // Diária, 08:00
    handler: checkDataFreshness,
    enabled: true
  }
];

/**
 * Wrapper que adiciona logs e notificações Telegram
 */
function wrapJobHandler(job: ScheduledJob) {
  return async () => {
    const startTime = Date.now();

    logger.info(`=== ${job.name} STARTED ===`);
    await telegram.notifyJobStart(job.name);

    try {
      await job.handler();

      const duration = Math.round((Date.now() - startTime) / 1000);

      logger.info({ duration }, `=== ${job.name} COMPLETED ===`);
      await telegram.notifyJobSuccess(job.name, duration);

    } catch (error) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        duration,
        error: errorMessage
      }, `=== ${job.name} FAILED ===`);

      await telegram.notifyJobFailure(job.name, errorMessage);

      // Não lançar erro para não crashar o worker
      // Próxima execução tentará novamente
    }
  };
}

/**
 * Setup do scheduler com todos os jobs
 */
export function setupScheduler(): ScheduledJob[] {
  const scheduledJobs: ScheduledJob[] = [];

  for (const job of JOBS) {
    if (!job.enabled) {
      logger.info(`Job disabled: ${job.name}`);
      continue;
    }

    logger.info({ schedule: job.schedule }, `Scheduling job: ${job.name}`);

    cron.schedule(job.schedule, wrapJobHandler(job), {
      timezone: 'America/Sao_Paulo'  // Horário de Brasília
    });

    scheduledJobs.push(job);
  }

  return scheduledJobs;
}
