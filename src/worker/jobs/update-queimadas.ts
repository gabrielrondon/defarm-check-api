#!/usr/bin/env tsx
/**
 * Worker job para atualização diária de focos de queimadas do INPE
 *
 * Executa diariamente para baixar dados dos últimos dias e manter
 * base sempre atualizada (últimos 90 dias).
 *
 * Schedule: Diário às 04:00 (após processamento do INPE)
 */

import { logger } from '../../utils/logger.js';
import { sendTelegramNotification } from '../../services/telegram.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function updateQueimadas() {
  logger.info('Starting INPE Queimadas update job...');

  const startTime = Date.now();
  const jobName = 'INPE Queimadas Update';

  try {
    await sendTelegramNotification('🔥', jobName, 'started');

    // Run download script
    logger.info('Downloading latest fire hotspot data from INPE...');
    const downloadResult = await execAsync('npm run data:queimadas');
    logger.info({ stdout: downloadResult.stdout }, 'Download completed');

    // Run seed script
    logger.info('Seeding fire hotspot data into database...');
    const seedResult = await execAsync('npm run seed:queimadas');
    logger.info({ stdout: seedResult.stdout }, 'Seed completed');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    await sendTelegramNotification(
      '✅',
      jobName,
      'completed',
      `Duration: ${duration}s`
    );

    logger.info({ duration }, 'INPE Queimadas update completed successfully');
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.error({ error, duration }, 'INPE Queimadas update failed');

    await sendTelegramNotification(
      '❌',
      jobName,
      'failed',
      `Error: ${error.message}\nDuration: ${duration}s`
    );

    throw error;
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  updateQueimadas()
    .then(() => {
      logger.info('Job finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Job failed');
      process.exit(1);
    });
}
