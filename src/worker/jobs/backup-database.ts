/**
 * Backup Database Job
 *
 * Executa backup automático do PostgreSQL
 * Frequência: Semanal (domingos 01:00 UTC)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export async function backupDatabase(): Promise<void> {
  logger.info('Starting database backup job');

  try {
    // Executar script de backup
    const { stdout, stderr } = await execAsync('npm run backup:database');

    if (stdout) logger.info('Backup output', { stdout });
    if (stderr) logger.warn('Backup warnings', { stderr });

    logger.info('✅ Database backup completed successfully');

  } catch (error) {
    logger.error('❌ Database backup failed', { error });
    throw error;
  }
}
