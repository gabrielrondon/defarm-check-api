#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { logger } from '../src/utils/logger.js';

type IeRow = {
  ie: string;
  state: string;
  document?: string;
  documentType?: string;
  legalName?: string;
  registrationStatus?: string;
  municipality?: string;
  source?: string;
};

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function readRows(filePath: string): IeRow[] {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.json') {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON input must be an array of IE records.');
    }
    return parsed as IeRow[];
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  return records.map((r) => ({
    ie: r.ie || r.IE || '',
    state: (r.state || r.uf || r.UF || '').toUpperCase(),
    document: r.document || r.cnpj || r.cpf || '',
    documentType: (r.documentType || r.document_type || '').toUpperCase(),
    legalName: r.legalName || r.legal_name || r.name || '',
    registrationStatus: r.registrationStatus || r.registration_status || r.status || '',
    municipality: r.municipality || r.city || '',
    source: r.source || 'SEFAZ/SINTEGRA'
  }));
}

async function main() {
  const filePath = process.argv[2] || 'data/ie_registry_seed.csv';
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Use examples/ie_registry_seed.sample.csv as template.`);
  }

  const rows = readRows(filePath);
  if (rows.length === 0) {
    logger.warn({ filePath }, 'No IE records found');
    return;
  }

  let inserted = 0;
  for (const row of rows) {
    const ie = normalizeDigits(row.ie || '');
    const state = (row.state || '').toUpperCase();
    if (!ie || !state) continue;

    const document = row.document ? normalizeDigits(row.document) : null;
    const documentType =
      row.documentType && ['CPF', 'CNPJ'].includes(row.documentType)
        ? row.documentType
        : document
          ? document.length === 11
            ? 'CPF'
            : document.length === 14
              ? 'CNPJ'
              : null
          : null;

    await db.execute(sql`
      INSERT INTO ie_registry (
        ie,
        state,
        document,
        document_type,
        legal_name,
        registration_status,
        municipality,
        source,
        last_synced_at,
        updated_at
      )
      VALUES (
        ${ie},
        ${state},
        ${document},
        ${documentType},
        ${row.legalName || null},
        ${row.registrationStatus || null},
        ${row.municipality || null},
        ${row.source || 'SEFAZ/SINTEGRA'},
        NOW(),
        NOW()
      )
      ON CONFLICT (ie) DO UPDATE
      SET
        state = EXCLUDED.state,
        document = EXCLUDED.document,
        document_type = EXCLUDED.document_type,
        legal_name = EXCLUDED.legal_name,
        registration_status = EXCLUDED.registration_status,
        municipality = EXCLUDED.municipality,
        source = EXCLUDED.source,
        last_synced_at = NOW(),
        updated_at = NOW()
    `);
    inserted++;
  }

  logger.info({ filePath, totalRows: rows.length, upserted: inserted }, 'IE registry seeding completed');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to seed IE registry');
  process.exit(1);
});
