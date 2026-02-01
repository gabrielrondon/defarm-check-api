/**
 * Cron Scheduler - Configuração de todos os jobs
 *
 * Usa node-cron para agendar execuções automáticas
 */

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { createJobExecutor } from './job-executor.js';

// Import job handlers
import { updateDETER } from './jobs/update-deter.js';
import { updatePRODES } from './jobs/update-prodes.js';
import { updateListaSuja } from './jobs/update-lista-suja.js';
import { updateCguSancoes } from './jobs/update-cgu-sancoes.js';
import { updateIbama } from './jobs/update-ibama.js';
import { updateSpatialData } from './jobs/update-spatial-data.js';
import { updateCAR } from './jobs/update-car.js';
import { updateQueimadas } from './jobs/update-queimadas.js';
import { checkDataFreshness } from './jobs/check-data-freshness.js';
import { backupDatabase } from './jobs/backup-database.js';

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
    name: 'PRODES Deforestation',
    schedule: '0 5 1 * *',  // Mensal (dia 1), 05:00
    handler: updatePRODES,
    enabled: true
  },
  {
    name: 'Lista Suja',
    schedule: '0 2 1 * *',  // Mensal (dia 1), 02:00
    handler: updateListaSuja,
    enabled: true
  },
  {
    name: 'CGU Sanctions',
    schedule: '0 5 1 * *',  // Mensal (dia 1), 05:00
    handler: updateCguSancoes,
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
    name: 'INPE Queimadas',
    schedule: '0 4 * * *',  // Diária, 04:00
    handler: updateQueimadas,
    enabled: true
  },
  {
    name: 'Data Freshness Check',
    schedule: '0 8 * * *',  // Diária, 08:00
    handler: checkDataFreshness,
    enabled: true
  },
  {
    name: 'Database Backup',
    schedule: '0 1 * * 0',  // Semanal (domingo), 01:00
    handler: backupDatabase,
    enabled: false  // DISABLED: Script runs locally, not in Railway
  }
];

// Removed old wrapJobHandler - now using createJobExecutor from job-executor.ts

/**
 * Setup do scheduler com todos os jobs
 * Now using enhanced job executor with retry logic and failure tracking
 */
export function setupScheduler(): ScheduledJob[] {
  const scheduledJobs: ScheduledJob[] = [];

  for (const job of JOBS) {
    if (!job.enabled) {
      logger.info(`Job disabled: ${job.name}`);
      continue;
    }

    logger.info({ schedule: job.schedule }, `Scheduling job: ${job.name}`);

    // Create job executor with retry logic and failure tracking
    const executor = createJobExecutor(job.name, job.handler, {
      maxRetries: 3,           // Try 3 times before giving up
      initialDelayMs: 5000,    // Start with 5s delay
      maxDelayMs: 300000,      // Max 5 min delay between retries
      backoffMultiplier: 2     // Exponential backoff (5s, 10s, 20s, ...)
    });

    cron.schedule(job.schedule, executor, {
      timezone: 'America/Sao_Paulo'  // Horário de Brasília
    });

    scheduledJobs.push(job);
  }

  return scheduledJobs;
}
