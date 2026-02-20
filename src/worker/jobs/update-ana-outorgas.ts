/**
 * Worker job: ANA Outorgas refresh
 *
 * Baixa outorgas de uso de recursos hídricos da ANA (dadosabertos.ana.gov.br)
 * e atualiza a tabela ana_outorgas.
 *
 * Schedule: Mensal (dia 1, 06:00)
 */

import { logger } from '../../utils/logger.js';
import { sendTelegramNotification } from '../../services/telegram.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function updateAnaOutorgas(): Promise<void> {
  const jobName = 'ANA Outorgas Update';
  const startTime = Date.now();

  logger.info('Starting ANA Outorgas update job...');

  try {
    await sendTelegramNotification('💧', jobName, 'started');

    logger.info('Downloading ANA Outorgas data...');
    const dlResult = await execAsync('npm run data:ana-outorgas', { timeout: 300_000 });
    logger.info({ stdout: dlResult.stdout?.slice(-500) }, 'Download completed');

    logger.info('Seeding ANA Outorgas into database...');
    const seedResult = await execAsync('npm run seed:ana-outorgas', { timeout: 300_000 });
    logger.info({ stdout: seedResult.stdout?.slice(-500) }, 'Seed completed');

    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));

    await sendTelegramNotification('✅', jobName, 'success', { duration });
    logger.info({ duration }, 'ANA Outorgas update completed successfully');
  } catch (error: any) {
    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
    logger.error({ error, duration }, 'ANA Outorgas update failed');
    await sendTelegramNotification('❌', jobName, 'failed', { error: error.message });
    throw error;
  }
}
