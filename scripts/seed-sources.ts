import { db } from '../src/db/client.js';
import { checkerSources } from '../src/db/schema.js';
import { logger } from '../src/utils/logger.js';

const sources = [
  {
    name: 'Slave Labor Registry',
    category: 'social',
    description: 'Verifica se CNPJ/CPF está na Lista Suja do Trabalho Escravo (MTE)',
    dataSourceUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_empregadores.pdf',
    lastUpdated: new Date('2026-01-15'),
    isActive: true,
    priority: 9,
    config: {
      endpoint: 'https://api.mte.gov.br/v1/lista-suja',
      cacheTTL: 86400
    }
  },
  {
    name: 'CAR Registry',
    category: 'environmental',
    description: 'Verifica situação do Cadastro Ambiental Rural (SICAR)',
    dataSourceUrl: 'https://www.car.gov.br/',
    lastUpdated: new Date('2025-12-01'),
    isActive: true,
    priority: 8,
    config: {
      endpoint: 'https://www.car.gov.br/publico/api',
      cacheTTL: 2592000
    }
  },
  {
    name: 'PRODES Deforestation',
    category: 'environmental',
    description: 'Verifica desmatamento através de dados PRODES/DETER (INPE)',
    dataSourceUrl: 'http://terrabrasilis.dpi.inpe.br/',
    lastUpdated: new Date('2025-12-01'),
    isActive: true,
    priority: 10,
    config: {
      endpoint: 'http://terrabrasilis.dpi.inpe.br/api',
      cacheTTL: 604800
    }
  }
];

async function seed() {
  logger.info('Seeding checker sources...');

  try {
    for (const source of sources) {
      await db.insert(checkerSources).values(source).onConflictDoNothing();
      logger.info({ name: source.name }, 'Source seeded');
    }

    logger.info('Seeding completed!');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Seeding failed');
    process.exit(1);
  }
}

seed();
