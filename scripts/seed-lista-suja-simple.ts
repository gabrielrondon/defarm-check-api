import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ListaSujaRecord {
  document: string;
  documentFormatted: string;
  type: 'CNPJ' | 'CPF';
  name: string;
  year: number;
  state: string;
  address: string;
  workersAffected: number;
  cnae: string;
  inclusionDate: string;
}

async function seed() {
  logger.info('Seeding Lista Suja to database...');

  try {
    // Ler arquivo JSON
    const dataPath = join(process.cwd(), 'data', 'lista_suja.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const records: ListaSujaRecord[] = JSON.parse(rawData);

    logger.info({ count: records.length }, 'Lista Suja records loaded from file');

    // Limpar tabela existente
    await db.execute(sql`TRUNCATE TABLE lista_suja`);
    logger.info('Cleared existing Lista Suja records');

    // Inserir com SQL raw para evitar problemas com Drizzle
    let inserted = 0;
    for (const r of records) {
      await db.execute(sql`
        INSERT INTO lista_suja (
          document, document_formatted, type, name, year, state, address, workers_affected, cnae, inclusion_date
        ) VALUES (
          ${r.document},
          ${r.documentFormatted},
          ${r.type},
          ${r.name},
          ${r.year},
          ${r.state || null},
          ${r.address || null},
          ${r.workersAffected || null},
          ${r.cnae || null},
          ${r.inclusionDate || null}
        )
        ON CONFLICT (document) DO NOTHING
      `);

      inserted++;
      if (inserted % 100 === 0) {
        logger.info({ inserted, total: records.length }, 'Progress...');
      }
    }

    logger.info({ totalRecords: inserted }, 'Lista Suja seeding completed! ✓');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Lista Suja seeding failed');
    process.exit(1);
  }
}

seed();
