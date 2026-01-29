import { db } from '../src/db/client.js';
import { ibamaEmbargoes } from '../src/db/schema.js';
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
    await db.delete(ibamaEmbargoes);
    logger.info('Cleared existing IBAMA records');

    // Inserir em lotes de 100
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      await db.insert(ibamaEmbargoes).values(
        batch.map(r => ({
          document: r.document,
          documentFormatted: r.documentFormatted,
          type: r.type,
          name: r.name,
          embargoCount: r.embargoCount,
          totalAreaHa: Math.round(r.totalArea_ha), // Arredondar para integer
          embargos: r.embargos
        }))
      );

      logger.info({
        batch: Math.floor(i / batchSize) + 1,
        inserted: Math.min(i + batchSize, records.length),
        total: records.length
      }, 'Batch inserted');
    }

    logger.info({ totalRecords: records.length }, 'IBAMA Embargoes seeding completed! ✓');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'IBAMA seeding failed');
    process.exit(1);
  }
}

seed();
