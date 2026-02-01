/**
 * Job: Atualização CGU Sanções (CEIS, CNEP, CEAF)
 *
 * Frequência: MENSAL (1º dia, 05:00)
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

async function getCurrentCounts(): Promise<Record<string, number>> {
  const result = await db.execute(sql`
    SELECT
      sanction_type,
      COUNT(*) as count
    FROM cgu_sancoes
    GROUP BY sanction_type
  `);

  const counts: Record<string, number> = {};
  result.rows.forEach((row: any) => {
    counts[row.sanction_type] = Number(row.count);
  });

  return counts;
}

export async function updateCguSancoes(): Promise<void> {
  logger.info('Starting CGU Sanctions update job');

  const beforeCounts = await getCurrentCounts();

  try {
    // Download
    logger.info('Downloading CGU sanctions data...');
    await execAsync('tsx scripts/download-cgu-sancoes.ts');

    // Seed
    logger.info('Seeding CGU sanctions data...');
    await execAsync('tsx scripts/seed-cgu-sancoes.ts');

    const afterCounts = await getCurrentCounts();

    // Calculate changes
    const changes = {
      ceis: (afterCounts['CEIS'] || 0) - (beforeCounts['CEIS'] || 0),
      cnep: (afterCounts['CNEP'] || 0) - (beforeCounts['CNEP'] || 0),
      ceaf: (afterCounts['CEAF'] || 0) - (beforeCounts['CEAF'] || 0)
    };

    const totalChanges = Math.abs(changes.ceis) + Math.abs(changes.cnep) + Math.abs(changes.ceaf);

    // Notificar mudanças significativas (usando notifyJobSuccess do telegram service)
    if (totalChanges > 0) {
      logger.info({
        ceis: afterCounts['CEIS'] || 0,
        cnep: afterCounts['CNEP'] || 0,
        ceaf: afterCounts['CEAF'] || 0,
        totalChanges
      }, 'CGU Sanctions updated with changes');
    }

    // Invalidar cache de CGU (dados foram atualizados)
    const invalidated = await cacheService.invalidateChecker('CGU Sanctions');
    logger.info({ invalidated }, 'CGU Sanctions cache invalidated');

    // Update data source freshness
    const totalRecords = (afterCounts['CEIS'] || 0) + (afterCounts['CNEP'] || 0) + (afterCounts['CEAF'] || 0);
    await updateDataSourceFreshness('CGU Sanctions', {
      totalRecords,
      lastUpdateChanges: totalChanges
    });

    logger.info({
      before: beforeCounts,
      after: afterCounts,
      changes
    }, 'CGU Sanctions update completed');

  } catch (error: any) {
    logger.error({ error: error.message }, 'CGU Sanctions update failed');
    throw error;
  }
}
