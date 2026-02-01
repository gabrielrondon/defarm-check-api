#!/usr/bin/env tsx
/**
 * Cron Job: Atualização dos Embargos IBAMA
 *
 * Frequência: SEMANAL (domingo, 02:00)
 * Cron: 0 2 * * 0
 *
 * O que faz:
 * 1. Download do CSV do IBAMA (155MB)
 * 2. Filtrar apenas novos embargos (desde last_updated)
 * 3. Aggregate por CPF/CNPJ
 * 4. Insert/Update apenas modificados
 * 5. Invalidar cache Redis dos documentos afetados
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs/promises';

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
        format.printf(({ timestamp, level, message }) => {
          const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
          return `[${ts}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({
      filename: 'logs/cron-ibama.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

async function getLastUpdate(): Promise<Date | null> {
  try {
    const result = await db.execute(sql`
      SELECT MAX(created_at) as last_update
      FROM ibama_embargoes
    `);

    if (result.rows.length > 0 && result.rows[0].last_update) {
      return new Date(result.rows[0].last_update as string);
    }
    return null;
  } catch {
    return null;
  }
}

async function downloadCSV(): Promise<string> {
  logger.info('Downloading IBAMA embargoes CSV...');

  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const downloadCmd = `curl -L 'https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/termo_embargo/termo_embargo_csv.zip' -o ${dataDir}/ibama_embargos.zip`;

  try {
    await execAsync(downloadCmd);
    logger.info('Download completed');

    // Unzip
    logger.info('Extracting ZIP...');
    await execAsync(`cd ${dataDir} && unzip -o ibama_embargos.zip`);

    return dataDir;
  } catch (error) {
    logger.error('Download failed', { error });
    throw error;
  }
}

async function convertAndSeed(dataDir: string, lastUpdate: Date | null) {
  logger.info('Converting CSV to JSON...');

  try {
    const convertCmd = `tsx scripts/convert-ibama-embargos.ts`;
    await execAsync(convertCmd);
    logger.info('Conversion completed');

    // Seed (script já faz upsert)
    logger.info('Seeding database...');
    const seedCmd = `tsx scripts/seed-ibama-simple.ts`;
    await execAsync(seedCmd);
    logger.info('Seed completed');

  } catch (error) {
    logger.error('Convert/Seed failed', { error });
    throw error;
  }
}

async function getUpdateStats() {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT document) as unique_documents,
      SUM(embargo_count) as total_embargoes,
      SUM(total_area_ha) as total_area
    FROM ibama_embargoes
  `);

  return result.rows[0];
}

async function main() {
  const startTime = Date.now();

  logger.info('='.repeat(60));
  logger.info('Starting IBAMA embargoes update job');
  logger.info('='.repeat(60));

  try {
    // 1. Verificar última atualização
    const lastUpdate = await getLastUpdate();
    logger.info('Last update', { lastUpdate: lastUpdate?.toISOString() || 'never' });

    // 2. Download CSV
    const dataDir = await downloadCSV();

    // 3. Converter e fazer seed
    await convertAndSeed(dataDir, lastUpdate);

    // 4. Estatísticas finais
    const stats = await getUpdateStats();
    const executionTime = Math.round((Date.now() - startTime) / 1000);

    logger.info('='.repeat(60));
    logger.info('IBAMA embargoes update completed successfully', {
      executionTimeSeconds: executionTime,
      stats
    });
    logger.info('='.repeat(60));

    // TODO: Invalidar cache Redis se necessário
    // TODO: Notificar Telegram se novos embargos > threshold

    process.exit(0);
  } catch (error) {
    logger.error('IBAMA update failed', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as updateIbama };
