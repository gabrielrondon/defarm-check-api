/**
 * Worker job: MAPA Orgânicos refresh
 *
 * Baixa o Cadastro Nacional de Produtores Orgânicos (CNPO/MAPA)
 * e atualiza a tabela mapa_organicos.
 *
 * Schedule: Mensal (dia 1, 07:00)
 */

import { logger } from '../../utils/logger.js';
import { sendTelegramNotification } from '../../services/telegram.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function updateMapaOrganicos(): Promise<void> {
  const jobName = 'MAPA Orgânicos Update';
  const startTime = Date.now();

  logger.info('Starting MAPA Orgânicos update job...');

  try {
    await sendTelegramNotification('🌱', jobName, 'started');

    logger.info('Downloading MAPA Orgânicos data...');
    const dlResult = await execAsync('npm run data:mapa-organicos', { timeout: 300_000 });
    logger.info({ stdout: dlResult.stdout?.slice(-500) }, 'Download completed');

    logger.info('Seeding MAPA Orgânicos into database...');
    const seedResult = await execAsync('npm run seed:mapa-organicos', { timeout: 300_000 });
    logger.info({ stdout: seedResult.stdout?.slice(-500) }, 'Seed completed');

    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));

    await sendTelegramNotification('✅', jobName, 'success', { duration });
    logger.info({ duration }, 'MAPA Orgânicos update completed successfully');
  } catch (error: any) {
    const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
    logger.error({ error, duration }, 'MAPA Orgânicos update failed');
    await sendTelegramNotification('❌', jobName, 'failed', { error: error.message });
    throw error;
  }
}
