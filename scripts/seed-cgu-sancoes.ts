#!/usr/bin/env tsx
/**
 * Script para processar e inserir sanções da CGU no banco
 *
 * Processa arquivos baixados:
 * - data/cgu_ceis.csv (Empresas Inidôneas e Suspensas)
 * - data/cgu_cnep.csv (Empresas Punidas - Lei Anticorrupção)
 * - data/cgu_ceaf.csv (Servidores Expulsos)
 *
 * Uso:
 *   npm run seed:cgu-sancoes
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { db } from '../src/db/client.js';
import { cguSancoes } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      const metaStr = Object.keys(meta).length ? '\n    ' + JSON.stringify(meta, null, 2) : '';
      return `[${ts}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [new transports.Console()]
});

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Normaliza CPF/CNPJ removendo formatação
 */
function normalizeDocument(doc: string): string | null {
  if (!doc) return null;
  return doc.replace(/[^\d]/g, '');
}

/**
 * Detecta tipo de documento baseado no tamanho
 */
function getDocumentType(doc: string): 'CPF' | 'CNPJ' | null {
  const normalized = normalizeDocument(doc);
  if (!normalized) return null;
  if (normalized.length === 11) return 'CPF';
  if (normalized.length === 14) return 'CNPJ';
  return null;
}

/**
 * Parse CSV genérico com detecção de colunas
 */
async function parseCSV(filePath: string): Promise<any[]> {
  const content = await fs.readFile(filePath, { encoding: 'latin1' }); // CGU usa latin1

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';', // CGU usa ponto-e-vírgula
    trim: true,
    bom: true,
    relax_column_count: true
  });

  return records;
}

/**
 * Mapeia campos do CSV CEIS para schema do banco
 */
function mapCEIS(record: any): any {
  // Colunas comuns do CEIS (pode variar)
  const document = normalizeDocument(record['CPF ou CNPJ do Sancionado'] || record['CNPJ'] || record['CPF'] || '');
  const type = getDocumentType(document);

  if (!document || !type) return null;

  return {
    document,
    documentFormatted: record['CPF ou CNPJ do Sancionado'] || '',
    type,
    name: record['Nome Sancionado'] || record['Pessoa Jurídica'] || record['Nome'] || '',
    sanctionType: 'CEIS',
    category: record['Tipo Sanção'] || '',
    startDate: record['Início Sanção'] || null,
    endDate: record['Fim Sanção'] || null,
    description: record['Fundamentação Legal'] || record['Motivo'] || '',
    sanctioningOrgan: record['Órgão Sancionador'] || record['Órgão'] || '',
    processNumber: record['Número do Processo'] || '',
    status: 'ATIVO',
    federativeUnit: record['UF'] || null,
    municipality: record['Município'] || null,
    source: 'CGU'
  };
}

/**
 * Mapeia campos do CSV CNEP para schema do banco
 */
function mapCNEP(record: any): any {
  const document = normalizeDocument(record['CNPJ ou CPF do Sancionado'] || record['CNPJ'] || record['CPF'] || '');
  const type = getDocumentType(document);

  if (!document || !type) return null;

  return {
    document,
    documentFormatted: record['CNPJ ou CPF do Sancionado'] || '',
    type,
    name: record['Razão Social'] || record['Nome'] || '',
    sanctionType: 'CNEP',
    category: record['Tipo Sanção'] || 'Multa Lei Anticorrupção',
    startDate: record['Data Início Sanção'] || null,
    endDate: record['Data Final Sanção'] || null,
    description: record['Descrição'] || record['Infração'] || '',
    sanctioningOrgan: record['Órgão Sancionador'] || '',
    processNumber: record['Número Processo'] || '',
    status: 'ATIVO',
    federativeUnit: record['UF'] || null,
    municipality: null,
    source: 'CGU'
  };
}

/**
 * Mapeia campos do CSV CEAF para schema do banco
 */
function mapCEAF(record: any): any {
  const document = normalizeDocument(record['CPF'] || '');
  const type = getDocumentType(document);

  if (!document || !type) return null;

  return {
    document,
    documentFormatted: record['CPF'] || '',
    type,
    name: record['Nome'] || '',
    sanctionType: 'CEAF',
    category: 'Expulsão Administração Federal',
    startDate: record['Data Publicação'] || null,
    endDate: null,
    description: record['Fundamentação Legal'] || record['Motivo'] || '',
    sanctioningOrgan: record['Órgão Lotação'] || '',
    processNumber: record['Número do Processo'] || '',
    status: 'ATIVO',
    federativeUnit: record['UF'] || null,
    municipality: null,
    source: 'CGU'
  };
}

/**
 * Seed CEIS
 */
async function seedCEIS(): Promise<number> {
  const filePath = path.join(DATA_DIR, 'cgu_ceis.csv');

  try {
    const stats = await fs.stat(filePath);
    logger.info(`Processing CEIS file: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

    const records = await parseCSV(filePath);
    logger.info(`Parsed ${records.length} CEIS records`);

    const mapped = records.map(mapCEIS).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid records`);

    if (mapped.length === 0) {
      logger.warn('No valid CEIS records to insert');
      return 0;
    }

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      await db.insert(cguSancoes).values(batch).onConflictDoNothing();
      inserted += batch.length;
      logger.info(`Inserted ${inserted}/${mapped.length} CEIS records`);
    }

    return inserted;

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn('CEIS file not found - skipping');
      return 0;
    }
    throw error;
  }
}

/**
 * Seed CNEP
 */
async function seedCNEP(): Promise<number> {
  const filePath = path.join(DATA_DIR, 'cgu_cnep.csv');

  try {
    const stats = await fs.stat(filePath);
    logger.info(`Processing CNEP file: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

    const records = await parseCSV(filePath);
    logger.info(`Parsed ${records.length} CNEP records`);

    const mapped = records.map(mapCNEP).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid records`);

    if (mapped.length === 0) {
      logger.warn('No valid CNEP records to insert');
      return 0;
    }

    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      await db.insert(cguSancoes).values(batch).onConflictDoNothing();
      inserted += batch.length;
      logger.info(`Inserted ${inserted}/${mapped.length} CNEP records`);
    }

    return inserted;

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn('CNEP file not found - skipping');
      return 0;
    }
    throw error;
  }
}

/**
 * Seed CEAF
 */
async function seedCEAF(): Promise<number> {
  const filePath = path.join(DATA_DIR, 'cgu_ceaf.csv');

  try {
    const stats = await fs.stat(filePath);
    logger.info(`Processing CEAF file: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

    const records = await parseCSV(filePath);
    logger.info(`Parsed ${records.length} CEAF records`);

    const mapped = records.map(mapCEAF).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid records`);

    if (mapped.length === 0) {
      logger.warn('No valid CEAF records to insert');
      return 0;
    }

    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      await db.insert(cguSancoes).values(batch).onConflictDoNothing();
      inserted += batch.length;
      logger.info(`Inserted ${inserted}/${mapped.length} CEAF records`);
    }

    return inserted;

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn('CEAF file not found - skipping');
      return 0;
    }
    throw error;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('CGU Sanções - Seed Database');
  logger.info('='.repeat(60));

  // Clear existing data
  logger.info('Clearing existing sanctions...');
  await db.delete(cguSancoes);
  logger.info('✅ Existing data cleared');

  // Seed all sources
  const ceisCount = await seedCEIS();
  const cnepCount = await seedCNEP();
  const ceafCount = await seedCEAF();

  const total = ceisCount + cnepCount + ceafCount;

  // Get final counts
  const result = await db.execute(sql`
    SELECT
      sanction_type,
      COUNT(*) as count
    FROM cgu_sancoes
    GROUP BY sanction_type
    ORDER BY sanction_type
  `);

  logger.info('='.repeat(60));
  logger.info('Seed Summary:');
  logger.info(`  CEIS: ${ceisCount} records`);
  logger.info(`  CNEP: ${cnepCount} records`);
  logger.info(`  CEAF: ${ceafCount} records`);
  logger.info(`  TOTAL: ${total} records`);
  logger.info('');
  logger.info('Database counts:');
  result.rows.forEach((row: any) => {
    logger.info(`  ${row.sanction_type}: ${row.count}`);
  });
  logger.info('='.repeat(60));

  if (total === 0) {
    logger.error('❌ No records inserted! Check if CSV files exist and have correct format.');
    process.exit(1);
  }

  logger.info('✅ Seed completed successfully');
}

main()
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$client.end();
  });
