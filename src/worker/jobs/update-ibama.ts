/**
 * Job: Atualização IBAMA Embargoes
 *
 * Frequência: SEMANAL (domingo, 02:00)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import path from 'path';

const execAsync = promisify(exec);

async function getStats() {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total_documents,
      SUM(embargo_count) as total_embargoes,
      SUM(total_area_ha) as total_area_ha
    FROM ibama_embargoes
  `);

  return result.rows[0];
}

export async function updateIbama(): Promise<void> {
  logger.info('Downloading IBAMA embargoes');

  const dataDir = path.join(process.cwd(), 'data');

  // Download
  const downloadCmd = `curl -L 'https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/termo_embargo/termo_embargo_csv.zip' -o ${dataDir}/ibama_embargos.zip`;
  await execAsync(downloadCmd);

  // Unzip
  await execAsync(`cd ${dataDir} && unzip -o ibama_embargos.zip`);

  // Convert
  await execAsync('tsx scripts/convert-ibama-embargos.ts');

  // Seed
  await execAsync('tsx scripts/seed-ibama-simple.ts');

  // Stats
  const stats = await getStats();

  logger.info({ stats }, 'IBAMA update completed');
}
