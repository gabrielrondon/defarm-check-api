#!/usr/bin/env tsx
/**
 * Script para processar e inserir produtores orgânicos certificados no banco
 *
 * Processa: data/cnpo_mapa.xlsx (MAPA/CNPO)
 *
 * Uso:
 *   npm run seed:mapa-organicos
 */

import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { db } from '../src/db/client.js';
import { mapaOrganicos } from '../src/db/schema.js';
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
 * Normaliza CPF/CNPJ removendo caracteres especiais
 */
function normalizeDocument(doc: string): string {
  if (!doc) return '';
  return String(doc).replace(/[^\d]/g, '');
}

/**
 * Determina se é CPF ou CNPJ
 */
function getDocumentType(doc: string): string {
  const normalized = normalizeDocument(doc);
  if (normalized.length === 11) return 'CPF';
  if (normalized.length === 14) return 'CNPJ';
  return 'OUTRO';
}

/**
 * Mapeia registro do Excel para schema do banco
 * NOTA: CPF/CNPJ são parcialmente mascarados (***XXXXX***) para privacidade
 */
function mapOrganicRecord(record: any): any {
  const producerName = String(record['NOME DO PRODUTOR'] || '').trim();

  if (!producerName) {
    return null; // Skip records without producer name
  }

  const status = String(record['SITUAÇÃO'] || '').toUpperCase().trim();

  // Only keep ATIVO (active) certifications
  if (status !== 'ATIVO') {
    return null;
  }

  // Document is masked (***XXXXX***), normalize anyway for storage
  const document = normalizeDocument(record['CNPF/CNPJ/NIF'] || '');
  const documentFormatted = String(record['CNPF/CNPJ/NIF'] || '');

  return {
    document: document || 'MASKED', // Store as MASKED if empty after normalization
    documentFormatted,
    type: document && document.length >= 11 ? getDocumentType(document) : 'MASKED',
    producerName,
    entityType: String(record['TIPO DE ENTIDADE'] || '').trim(),
    entityName: String(record['ENTIDADE'] || '').trim(),
    country: String(record['PAIS'] || '').trim(),
    state: String(record['UF'] || '').trim(),
    city: String(record['CIDADE'] || '').trim(),
    status,
    scope: String(record['ESCOPO'] || '').trim().substring(0, 5000), // Limit length
    activities: String(record['ATIVIDADES'] || '').trim().substring(0, 10000), // Limit length
    contact: String(record['CONTATO'] || '').trim().substring(0, 255),
    source: 'MAPA/CNPO'
  };
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('MAPA/CNPO - Seed Database');
  logger.info('='.repeat(60));

  const filePath = path.join(DATA_DIR, 'cnpo_mapa.xlsx');

  try {
    // Read Excel file
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    logger.info(`Reading sheet: ${sheetName}`);

    // Convert to JSON
    // Row 0: Update date, Row 1: Empty, Row 2: Headers, Row 3+: Data
    const records = XLSX.utils.sheet_to_json(worksheet, {
      range: 2, // Start from row 2 (0-based), which uses row 2 as headers and row 3+ as data
      defval: ''
    });

    logger.info(`Parsed ${records.length} organic producer records`);

    // Map and filter records
    const mapped = records.map(mapOrganicRecord).filter(Boolean);
    logger.info(`Mapped ${mapped.length} valid ACTIVE organic certifications`);

    if (mapped.length === 0) {
      logger.warn('No valid records to insert');
      return;
    }

    // Clear old data first
    await db.execute(sql`TRUNCATE TABLE mapa_organicos`);
    logger.info('✅ Cleared old organic producer data');

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);

      await db.insert(mapaOrganicos).values(batch).onConflictDoNothing();
      inserted += batch.length;

      logger.info(`Inserted ${inserted}/${mapped.length} organic producers`);
    }

    // Get statistics
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT state) as states,
        COUNT(DISTINCT entity_type) as entity_types,
        COUNT(DISTINCT type) as document_types,
        COUNT(CASE WHEN type = 'CPF' THEN 1 END) as cpf_count,
        COUNT(CASE WHEN type = 'CNPJ' THEN 1 END) as cnpj_count
      FROM mapa_organicos
    `);

    const row: any = stats.rows[0];

    logger.info('='.repeat(60));
    logger.info('Seed Summary:');
    logger.info(`  Total organic producers: ${row.total}`);
    logger.info(`  States: ${row.states}`);
    logger.info(`  Entity types: ${row.entity_types}`);
    logger.info(`  CPF (individuals): ${row.cpf_count}`);
    logger.info(`  CNPJ (companies): ${row.cnpj_count}`);
    logger.info('='.repeat(60));
    logger.info('✅ Seed completed successfully');

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.error('File not found: cnpo_mapa.xlsx');
      logger.error('Please run: npm run data:mapa-organicos');
      process.exit(1);
    }
    throw error;
  }
}

main()
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$client.end();
  });
