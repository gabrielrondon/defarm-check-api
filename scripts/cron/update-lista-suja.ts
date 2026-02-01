#!/usr/bin/env tsx
/**
 * Cron Job: Atualização da Lista Suja do Trabalho Escravo
 *
 * Frequência: MENSAL (1º dia do mês, 02:00)
 * Cron: 0 2 1 * *
 *
 * O que faz:
 * 1. Download da planilha XLSX do MTE
 * 2. Conversão para JSON
 * 3. Diff com base atual (detecta novos/removidos)
 * 4. Seed incremental no banco
 * 5. Log de mudanças
 * 6. Notificação (futuro: Telegram)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
          return `[${ts}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({
      filename: 'logs/cron-lista-suja.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

interface ListaSujaRecord {
  document: string;
  name: string;
  year: number;
  state: string;
}

async function getCurrentRecords(): Promise<Set<string>> {
  const result = await db.execute(sql`SELECT document FROM lista_suja`);
  return new Set(result.rows.map((r: any) => r.document));
}

async function downloadAndConvert(): Promise<string> {
  logger.info('Downloading Lista Suja from MTE...');

  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  // Download XLSX
  const downloadCmd = `curl -L 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.xlsx' -o ${dataDir}/lista_suja.xlsx`;

  try {
    await execAsync(downloadCmd);
    logger.info('Download completed');
  } catch (error) {
    logger.error('Download failed', { error });
    throw error;
  }

  // Converter para JSON (assumindo que temos script de conversão)
  logger.info('Converting XLSX to JSON...');

  try {
    const convertCmd = `tsx scripts/convert-lista-suja.ts`;
    await execAsync(convertCmd);
    logger.info('Conversion completed');

    return path.join(dataDir, 'lista_suja.json');
  } catch (error) {
    logger.error('Conversion failed', { error });
    throw error;
  }
}

async function detectChanges(newRecords: ListaSujaRecord[]) {
  const currentDocs = await getCurrentRecords();
  const newDocs = new Set(newRecords.map(r => r.document));

  const added = newRecords.filter(r => !currentDocs.has(r.document));
  const removed = Array.from(currentDocs).filter(doc => !newDocs.has(doc));

  return { added, removed };
}

async function updateDatabase(filepath: string) {
  logger.info('Reading new data...');
  const content = await fs.readFile(filepath, 'utf-8');
  const newRecords: ListaSujaRecord[] = JSON.parse(content);

  logger.info(`New data contains ${newRecords.length} records`);

  // Detectar mudanças
  const changes = await detectChanges(newRecords);

  logger.info('Changes detected', {
    added: changes.added.length,
    removed: changes.removed.length
  });

  // Remover documentos que não estão mais na lista
  if (changes.removed.length > 0) {
    logger.info(`Removing ${changes.removed.length} documents no longer in Lista Suja`);

    for (const doc of changes.removed) {
      await db.execute(sql`DELETE FROM lista_suja WHERE document = ${doc}`);
    }
  }

  // Adicionar novos (seed fará upsert)
  if (changes.added.length > 0) {
    logger.info(`Adding ${changes.added.length} new documents to Lista Suja`);

    // Chamar seed script
    const seedCmd = `tsx scripts/seed-lista-suja-simple.ts`;
    await execAsync(seedCmd);
  }

  return changes;
}

async function main() {
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('Starting Lista Suja update job');
  logger.info('='.repeat(60));

  try {
    // 1. Download e converter
    const filepath = await downloadAndConvert();

    // 2. Atualizar banco
    const changes = await updateDatabase(filepath);

    // 3. Log final
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    logger.info('='.repeat(60));
    logger.info('Lista Suja update completed successfully', {
      executionTimeSeconds: executionTime,
      added: changes.added.length,
      removed: changes.removed.length
    });
    logger.info('='.repeat(60));

    // TODO: Enviar notificação Telegram se houver mudanças significativas
    if (changes.added.length > 10 || changes.removed.length > 10) {
      logger.warn('Significant changes detected - manual review recommended');
    }

    process.exit(0);
  } catch (error) {
    logger.error('Lista Suja update failed', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as updateListaSuja };
