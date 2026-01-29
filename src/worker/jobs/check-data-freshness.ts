/**
 * Job: Verificação de Freshness dos Dados
 *
 * Frequência: DIÁRIA (08:00)
 */

import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { telegram } from '../../services/telegram.js';

interface DataSource {
  name: string;
  table: string;
  slaMaxDays: number;
}

const DATA_SOURCES: DataSource[] = [
  { name: 'Lista Suja', table: 'lista_suja', slaMaxDays: 35 },
  { name: 'IBAMA Embargoes', table: 'ibama_embargoes', slaMaxDays: 10 },
  { name: 'DETER Alerts', table: 'deter_alerts', slaMaxDays: 2 },
  { name: 'Terras Indígenas', table: 'terras_indigenas', slaMaxDays: 35 },
  { name: 'Unidades de Conservação', table: 'unidades_conservacao', slaMaxDays: 35 },
  { name: 'CAR', table: 'car_registrations', slaMaxDays: 35 }
];

async function checkSourceFreshness(source: DataSource) {
  const query = `
    SELECT
      MAX(created_at) as last_update,
      COUNT(*) as total
    FROM ${source.table}
  `;

  const result = await db.execute(sql.raw(query));
  const row = result.rows[0];

  const lastUpdate = row.last_update ? new Date(row.last_update as string) : null;

  if (!lastUpdate) {
    return { source, ageInDays: Infinity, status: 'CRITICAL' };
  }

  const now = new Date();
  const ageInMs = now.getTime() - lastUpdate.getTime();
  const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

  let status: 'FRESH' | 'STALE' | 'CRITICAL';

  if (ageInDays <= source.slaMaxDays) {
    status = 'FRESH';
  } else if (ageInDays <= source.slaMaxDays * 1.5) {
    status = 'STALE';
  } else {
    status = 'CRITICAL';
  }

  return { source, ageInDays, status };
}

export async function checkDataFreshness(): Promise<void> {
  const results = [];

  for (const source of DATA_SOURCES) {
    const result = await checkSourceFreshness(source);
    results.push(result);

    const emoji = result.status === 'FRESH' ? '✅' : result.status === 'STALE' ? '⚠️' : '❌';

    logger.info(`${emoji} ${result.source.name}`, {
      status: result.status,
      ageInDays: result.ageInDays,
      slaMaxDays: result.source.slaMaxDays
    });

    // Notificar se STALE ou CRITICAL
    if (result.status === 'STALE' || result.status === 'CRITICAL') {
      await telegram.notifyStaleData(
        result.source.name,
        result.ageInDays,
        result.source.slaMaxDays
      );
    }
  }

  const fresh = results.filter(r => r.status === 'FRESH').length;
  const stale = results.filter(r => r.status === 'STALE').length;
  const critical = results.filter(r => r.status === 'CRITICAL').length;

  logger.info('Data freshness check completed', {
    total: results.length,
    fresh,
    stale,
    critical
  });

  // Lançar erro se houver CRITICAL (para notificação automática)
  if (critical > 0) {
    throw new Error(`${critical} data sources are CRITICAL`);
  }
}
