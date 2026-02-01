#!/usr/bin/env tsx
/**
 * Script para processar e inserir sanções da CGU no banco
 *
 * Processa arquivos JSON da API:
 * - data/cgu_ceis_api.json (Empresas Inidôneas e Suspensas)
 * - data/cgu_cnep_api.json (Empresas Punidas - Lei Anticorrupção)
 *
 * Uso:
 *   npm run seed:cgu-sancoes
 */

import fs from 'fs/promises';
import path from 'path';
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
 * Converte data brasileira (dd/MM/yyyy) para ISO (yyyy-MM-dd)
 */
function convertBRDateToISO(dateStr: string): string | null {
  if (!dateStr || dateStr === 'Sem informação' || dateStr === 'Sem Informação') return null;

  // Formato: dd/MM/yyyy
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];

  return `${year}-${month}-${day}`;
}

/**
 * Mapeia campos da API CEIS para schema do banco
 */
function mapCEISFromAPI(record: any): any {
  const document = normalizeDocument(record.sancionado?.codigoFormatado || record.pessoa?.cpfFormatado || record.pessoa?.cnpjFormatado || '');
  const type = getDocumentType(document);

  if (!document || !type) return null;

  return {
    document,
    documentFormatted: record.sancionado?.codigoFormatado || '',
    type,
    name: record.sancionado?.nome || record.pessoa?.nome || '',
    sanctionType: 'CEIS',
    category: record.tipoSancao?.descricaoResumida || '',
    startDate: convertBRDateToISO(record.dataInicioSancao),
    endDate: convertBRDateToISO(record.dataFimSancao),
    description: (record.fundamentacao?.[0]?.codigo || record.fundamentacao?.[0]?.descricao || '').substring(0, 1000), // Limit to avoid huge texts
    sanctioningOrgan: record.orgaoSancionador?.nome || '',
    processNumber: record.numeroProcesso || '',
    status: 'ATIVO',
    federativeUnit: record.orgaoSancionador?.siglaUf || null,
    municipality: null,
    source: 'CGU'
  };
}

/**
 * Mapeia campos da API CNEP para schema do banco
 */
function mapCNEPFromAPI(record: any): any {
  const document = normalizeDocument(record.sancionado?.codigoFormatado || record.pessoa?.cpfFormatado || record.pessoa?.cnpjFormatado || '');
  const type = getDocumentType(document);

  if (!document || !type) return null;

  return {
    document,
    documentFormatted: record.sancionado?.codigoFormatado || '',
    type,
    name: record.sancionado?.nome || record.pessoa?.nome || '',
    sanctionType: 'CNEP',
    category: record.tipoSancao?.descricaoResumida || 'Multa Lei Anticorrupção',
    startDate: convertBRDateToISO(record.dataInicioSancao),
    endDate: convertBRDateToISO(record.dataFimSancao),
    description: (record.fundamentacao?.[0]?.codigo || record.fundamentacao?.[0]?.descricao || '').substring(0, 1000),
    sanctioningOrgan: record.orgaoSancionador?.nome || '',
    processNumber: record.numeroProcesso || '',
    status: 'ATIVO',
    federativeUnit: record.orgaoSancionador?.siglaUf || null,
    municipality: null,
    source: 'CGU'
  };
}

/**
 * Seed CEIS from API JSON
 */
async function seedCEIS(): Promise<number> {
  const filePath = path.join(DATA_DIR, 'cgu_ceis_api.json');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const records = JSON.parse(content);

    logger.info(`Parsed ${records.length} CEIS records from API`);

    const mapped = records.map(mapCEISFromAPI).filter(Boolean);
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
      logger.warn('CEIS API file not found - skipping');
      return 0;
    }
    throw error;
  }
}

/**
 * Seed CNEP from API JSON
 */
async function seedCNEP(): Promise<number> {
  const filePath = path.join(DATA_DIR, 'cgu_cnep_api.json');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const records = JSON.parse(content);

    logger.info(`Parsed ${records.length} CNEP records from API`);

    const mapped = records.map(mapCNEPFromAPI).filter(Boolean);
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
      logger.warn('CNEP API file not found - skipping');
      return 0;
    }
    throw error;
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('CGU Sanções - Seed Database from API');
  logger.info('='.repeat(60));

  // Clear existing data
  logger.info('Clearing existing sanctions...');
  await db.delete(cguSancoes);
  logger.info('✅ Existing data cleared');

  // Seed all sources
  const ceisCount = await seedCEIS();
  const cnepCount = await seedCNEP();

  const total = ceisCount + cnepCount;

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
  logger.info(`  TOTAL: ${total} records`);
  logger.info('');
  logger.info('Database counts:');
  result.rows.forEach((row: any) => {
    logger.info(`  ${row.sanction_type}: ${row.count}`);
  });
  logger.info('='.repeat(60));

  if (total === 0) {
    logger.error('❌ No records inserted! Check if API JSON files exist.');
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
