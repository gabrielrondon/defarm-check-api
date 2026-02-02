/**
 * Job: Atualização PRODES (Deforestation Monitoring)
 *
 * Frequência: MENSAL (1º dia, 05:00)
 *
 * PRODES é atualizado anualmente pelo INPE (geralmente em novembro)
 * com dados consolidados do ano anterior. Este job verifica mensalmente
 * por atualizações e baixa apenas os últimos 3 anos para otimizar.
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

async function getProdesStats() {
  const result = await db.execute(sql`
    SELECT
      year,
      state,
      COUNT(*) as polygon_count,
      ROUND(SUM(area_km2)::numeric, 2) as total_area_km2
    FROM prodes_deforestation
    WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 3
    GROUP BY year, state
    ORDER BY year DESC, total_area_km2 DESC
  `);

  return result.rows;
}

async function getTopDeforestationStates(year: number) {
  const result = await db.execute(sql`
    SELECT
      state,
      COUNT(*) as polygon_count,
      ROUND(SUM(area_km2)::numeric, 2) as total_area_km2
    FROM prodes_deforestation
    WHERE year = ${year}
    GROUP BY state
    ORDER BY total_area_km2 DESC
    LIMIT 5
  `);

  return result.rows;
}

export async function updatePRODES(): Promise<void> {
  logger.info('Starting PRODES monthly update');

  try {
    // Download PRODES Amazônia (último 3 anos) - bioma mais importante
    logger.info('Downloading PRODES Amazônia (last 3 years)');
    await execAsync('tsx scripts/download-prodes-complete.ts --biome=amazonia --years=3');

    // Seed data (clean first to avoid duplicates)
    logger.info('Seeding PRODES data');
    await execAsync('tsx scripts/seed-prodes-complete.ts --file=prodes_amazonia_3y.json --clean');

    // Get statistics
    const stats: any[] = await getProdesStats();
    const currentYear = new Date().getFullYear() - 1; // PRODES year is previous year
    const topStates: any[] = await getTopDeforestationStates(currentYear);

    // Total count for data freshness
    const totalCount = await db.execute(sql`SELECT COUNT(*) as count FROM prodes_deforestation`);
    const totalRecords = Number(totalCount.rows[0]?.count || 0);

    logger.info({
      totalRecords,
      latestYear: currentYear,
      topStates: topStates.map((s: any) => ({
        state: s.state,
        area_km2: s.total_area_km2
      }))
    }, 'PRODES update completed');

    // Invalidate PRODES checker cache
    const invalidated = await cacheService.invalidateChecker('PRODES Deforestation');
    logger.info({ invalidated }, 'PRODES cache invalidated');

    // Update data source freshness
    await updateDataSourceFreshness('PRODES Deforestation', {
      totalRecords,
      lastUpdateYear: currentYear
    });

    // Telegram notification with top 3 states
    const top3 = topStates.slice(0, 3);
    const message = [
      `🌳 *PRODES Updated*`,
      ``,
      `📊 Total Records: ${totalRecords.toLocaleString()}`,
      `📅 Latest Year: ${currentYear}`,
      ``,
      `🔥 *Top Deforestation States (${currentYear}):*`,
      ...top3.map((s: any, i: number) =>
        `${i + 1}. ${s.state}: ${Number(s.total_area_km2).toLocaleString()} km²`
      )
    ].join('\n');

    await telegram.sendMessage({ text: message, parse_mode: 'Markdown' });

  } catch (error) {
    logger.error({ err: error, msg: 'Failed to update PRODES' });
    await telegram.sendMessage({
      text: `❌ *PRODES Update Failed*\n\n${error instanceof Error ? error.message : String(error)}`,
      parse_mode: 'Markdown'
    });
    throw error;
  }
}
