import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

interface IbamaRecord {
  document: string;
  documentFormatted: string;
  type: 'CNPJ' | 'CPF';
  name: string;
  embargoCount: number;
  totalArea_ha: number;
  embargos: any[];
}

async function seed() {
  logger.info('Seeding IBAMA Embargoes to database...');

  try {
    // Ler arquivo JSON
    const dataPath = join(process.cwd(), 'data', 'ibama_embargos.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const records: IbamaRecord[] = JSON.parse(rawData);

    logger.info({ count: records.length }, 'IBAMA records loaded from file');

    // Limpar tabela existente
    await db.execute(sql`TRUNCATE TABLE ibama_embargoes`);
    logger.info('Cleared existing IBAMA records');

    // Inserir com SQL raw
    let inserted = 0;
    for (const r of records) {
      await db.execute(sql`
        INSERT INTO ibama_embargoes (
          document, document_formatted, type, name, embargo_count, total_area_ha, embargos
        ) VALUES (
          ${r.document},
          ${r.documentFormatted},
          ${r.type},
          ${r.name},
          ${r.embargoCount},
          ${Math.round(r.totalArea_ha)},
          ${JSON.stringify(r.embargos)}::jsonb
        )
      `);

      inserted++;
      if (inserted % 1000 === 0) {
        logger.info({ inserted, total: records.length }, 'Progress...');
      }
    }

    logger.info({ totalRecords: inserted }, 'IBAMA Embargoes seeding completed! ✓');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'IBAMA seeding failed');
    process.exit(1);
  }
}

seed();
