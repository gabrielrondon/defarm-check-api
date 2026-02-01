/**
 * Job: Atualização IBAMA Embargoes
 *
 * Frequência: SEMANAL (domingo, 02:00)
 */

import { exec } from 'child_process';
import { promisify} from 'util';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { telegram } from '../../services/telegram.js';
import { cacheService } from '../../services/cache.js';
import { updateDataSourceFreshness } from '../../utils/data-freshness.js';
import path from 'path';
import axios from 'axios';
import fs from 'fs/promises';

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

  // Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  // Download using axios (Railway doesn't have curl)
  const url = 'https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/termo_embargo/termo_embargo_csv.zip';
  const response = await axios.get(url, { responseType: 'arraybuffer', maxRedirects: 5 });
  await fs.writeFile(path.join(dataDir, 'ibama_embargos.zip'), Buffer.from(response.data));

  // Unzip
  await execAsync(`cd ${dataDir} && unzip -o ibama_embargos.zip`);

  // Convert
  await execAsync('tsx scripts/convert-ibama-embargos.ts');

  // Seed
  await execAsync('tsx scripts/seed-ibama-simple.ts');

  // Stats before update
  const statsBefore = await getStats();

  // Stats after update
  const statsAfter = await getStats();

  const newEmbargoes = Number(statsAfter.total_embargoes || 0) - Number(statsBefore.total_embargoes || 0);
  const newDocuments = Number(statsAfter.total_documents || 0) - Number(statsBefore.total_documents || 0);

  // Notificar se mudanças significativas (> 100 novos embargos ou > 50 documentos)
  if (newEmbargoes > 100 || newDocuments > 50) {
    await telegram.sendMessage({
      text: `📋 <b>IBAMA - Atualização Significativa</b>\n\n` +
        `🔴 Novos embargos: ${newEmbargoes}\n` +
        `📄 Novos documentos: ${newDocuments}\n` +
        `📊 Total embargos: ${statsAfter.total_embargoes}\n` +
        `📐 Área embargada: ${Number(statsAfter.total_area_ha || 0).toLocaleString('pt-BR')} ha\n\n` +
        `⚠️ <b>Aumento significativo detectado!</b>`
    });
  }

  // Invalidar cache de IBAMA (dados foram atualizados)
  const invalidated = await cacheService.invalidateChecker('IBAMA Embargoes');
  logger.info({ invalidated }, 'IBAMA cache invalidated');

  // Update data source freshness
  await updateDataSourceFreshness('IBAMA Embargoes', {
    totalRecords: Number(statsAfter.total_documents || 0),
    totalEmbargoes: Number(statsAfter.total_embargoes || 0),
    totalAreaHa: Number(statsAfter.total_area_ha || 0),
    lastUpdateEmbargoes: newEmbargoes,
    lastUpdateDocuments: newDocuments
  });

  logger.info({
    newEmbargoes,
    newDocuments,
    totalEmbargoes: statsAfter.total_embargoes
  }, 'IBAMA update completed');
}
