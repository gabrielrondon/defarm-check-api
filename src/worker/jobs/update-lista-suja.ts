/**
 * Job: Atualização Lista Suja (Trabalho Escravo)
 *
 * Frequência: MENSAL (1º dia, 02:00)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { telegram } from '../../services/telegram.js';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function getCurrentRecords(): Promise<Set<string>> {
  const result = await db.execute(sql`SELECT document, name FROM lista_suja`);
  return new Set(result.rows.map((r: any) => r.document));
}

async function getRecordNames(): Promise<Map<string, string>> {
  const result = await db.execute(sql`SELECT document, name FROM lista_suja`);
  const map = new Map<string, string>();
  result.rows.forEach((r: any) => {
    map.set(r.document, r.name);
  });
  return map;
}

export async function updateListaSuja(): Promise<void> {
  logger.info('Downloading Lista Suja from MTE');

  const dataDir = path.join(process.cwd(), 'data');

  // Download
  const downloadCmd = `curl -L 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.xlsx' -o ${dataDir}/lista_suja.xlsx`;
  await execAsync(downloadCmd);

  // Convert
  await execAsync('tsx scripts/convert-lista-suja.ts');

  // Detectar mudanças ANTES de fazer seed
  const currentDocs = await getCurrentRecords();
  const currentNames = await getRecordNames();

  // Ler novos dados
  const filepath = path.join(dataDir, 'lista_suja.json');
  const content = await fs.readFile(filepath, 'utf-8');
  const newRecords: any[] = JSON.parse(content);

  const newDocs = new Set(newRecords.map(r => r.document));

  const added = newRecords.filter(r => !currentDocs.has(r.document));
  const removed = Array.from(currentDocs).filter(doc => !newDocs.has(doc));

  logger.info('Changes detected', {
    added: added.length,
    removed: removed.length
  });

  // Seed
  await execAsync('tsx scripts/seed-lista-suja-simple.ts');

  // Notificar mudanças
  if (added.length > 0 || removed.length > 0) {
    const exampleNames = added.slice(0, 5).map(r => r.name);

    await telegram.notifyListaSujaChanges(
      added.length,
      removed.length,
      exampleNames
    );
  }

  logger.info('Lista Suja update completed', {
    added: added.length,
    removed: removed.length,
    total: newRecords.length
  });
}
