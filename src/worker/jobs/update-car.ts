/**
 * Job: Atualização CAR (Estados Prioritários)
 *
 * Frequência: MENSAL (dia 15, 03:00)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { telegram } from '../../services/telegram.js';

const execAsync = promisify(exec);

async function detectCriticalChanges() {
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
    const total = r.ativos + r.cancelados + r.suspensos + r.pendentes;
    const irregulares = r.cancelados + r.suspensos;
    const percentIrregular = (irregulares / total) * 100;

    return percentIrregular > 5;
  });

  return critical;
}

export async function updateCAR(): Promise<void> {
  logger.info('Downloading CAR for priority states');

  // Download (apenas estados prioritários)
  await execAsync('npm run data:car-all -- --priority');

  // Seed
  await execAsync('npm run seed:car-all');

  // Detectar mudanças críticas
  const criticalChanges: any[] = await detectCriticalChanges();

  if (criticalChanges.length > 0) {
    logger.warn({ states: criticalChanges.length }, 'Critical CAR changes detected');

    for (const change of criticalChanges) {
      const total = change.ativos + change.cancelados + change.suspensos + change.pendentes;

      await telegram.notifyCARCriticalChanges(
        change.state,
        change.cancelados,
        change.suspensos,
        total
      );
    }
  }

  logger.info({
    criticalStates: criticalChanges.length
  }, 'CAR update completed');
}
