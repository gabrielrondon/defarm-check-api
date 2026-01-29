import { db } from '../src/db/client.js';
import { listaSuja } from '../src/db/schema.js';
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
    await db.delete(listaSuja);
    logger.info('Cleared existing Lista Suja records');

    // Inserir em lotes de 50 (reduzido para evitar query muito grande)
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        await db.insert(listaSuja).values(
          batch.map(r => ({
            document: r.document || '',
            documentFormatted: r.documentFormatted || null,
            type: r.type || 'CNPJ',
            name: r.name || '',
            year: r.year || 2024,
            state: r.state || null,
            address: r.address || null,
            workersAffected: r.workersAffected || null,
            cnae: r.cnae || null,
            inclusionDate: r.inclusionDate || null
          }))
        );

        logger.info({
          batch: Math.floor(i / batchSize) + 1,
          inserted: Math.min(i + batchSize, records.length),
          total: records.length
        }, 'Batch inserted');
      } catch (batchErr) {
        logger.error({
          batch: Math.floor(i / batchSize) + 1,
          error: (batchErr as Error).message
        }, 'Batch insert failed');
        throw batchErr;
      }
    }

    logger.info({ totalRecords: records.length }, 'Lista Suja seeding completed! ✓');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Lista Suja seeding failed');
    process.exit(1);
  }
}

seed();
