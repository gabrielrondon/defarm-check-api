import { db } from '../src/db/client.js';
import { checkerSources } from '../src/db/schema.js';
import { logger } from '../src/utils/logger.js';

const sources = [
  // SOCIAL CHECKERS
  {
    name: 'Slave Labor Registry',
    category: 'social',
    description: 'Verifica se CNPJ/CPF está na Lista Suja do Trabalho Escravo (MTE)',
    dataSourceUrl: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_empregadores.xlsx',
    lastUpdated: new Date('2026-01-28'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 86400,
      totalRecords: 664,
      supportedInputs: ['CNPJ', 'CPF']
    }
  },

  // LEGAL CHECKERS
  {
    name: 'CGU Sanctions',
    category: 'legal',
    description: 'Verifica sanções do governo federal (CEIS, CNEP, CEAF)',
    dataSourceUrl: 'https://portaldatransparencia.gov.br/sancoes',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 10,
    config: {
      cacheTTL: 86400,
      supportedInputs: ['CNPJ', 'CPF']
    }
  },

  // ENVIRONMENTAL CHECKERS (SPATIAL)
  {
    name: 'CAR - Cadastro Ambiental Rural',
    category: 'environmental',
    description: 'Verifica situação do Cadastro Ambiental Rural (SICAR)',
    dataSourceUrl: 'https://www.car.gov.br/',
    lastUpdated: new Date('2026-02-02'),
    isActive: true,
    priority: 8,
    config: {
      cacheTTL: 2592000,
      totalRecords: 8096127,
      supportedInputs: ['CAR', 'COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'CAR x PRODES Intersection',
    category: 'environmental',
    description: 'Cruza geometria do CAR com polígonos PRODES para detectar desmatamento em propriedades',
    dataSourceUrl: 'http://terrabrasilis.dpi.inpe.br/',
    lastUpdated: new Date('2026-02-02'),
    isActive: true,
    priority: 10,
    config: {
      cacheTTL: 1209600,
      supportedInputs: ['CAR', 'COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'PRODES Deforestation',
    category: 'environmental',
    description: 'Verifica se coordenadas caem em polígono de desmatamento (PRODES/INPE)',
    dataSourceUrl: 'http://terrabrasilis.dpi.inpe.br/',
    lastUpdated: new Date('2025-12-01'),
    isActive: true,
    priority: 10,
    config: {
      cacheTTL: 604800,
      totalRecords: 216252,
      supportedInputs: ['COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'DETER Real-Time Alerts',
    category: 'environmental',
    description: 'Alertas de desmatamento em tempo real (últimos 90 dias)',
    dataSourceUrl: 'http://terrabrasilis.dpi.inpe.br/',
    lastUpdated: new Date('2026-02-02'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 3600,
      totalRecords: 0,
      supportedInputs: ['COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'MapBiomas Validated Deforestation',
    category: 'environmental',
    description: 'Desmatamento validado por analistas (MapBiomas Alerta)',
    dataSourceUrl: 'https://plataforma.alerta.mapbiomas.org/',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 86400,
      totalRecords: 35447,
      supportedInputs: ['COORDINATES', 'CAR', 'ADDRESS']
    }
  },
  {
    name: 'IBAMA Embargoes',
    category: 'environmental',
    description: 'Verifica embargos ambientais do IBAMA (buffer 5km para coordenadas)',
    dataSourceUrl: 'https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-termo-de-embargo',
    lastUpdated: new Date('2026-01-28'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 604800,
      totalRecords: 122814,
      supportedInputs: ['CNPJ', 'CPF', 'COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'Indigenous Lands',
    category: 'environmental',
    description: 'Verifica se coordenadas caem em Terra Indígena (FUNAI)',
    dataSourceUrl: 'https://geoserver.funai.gov.br/',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 2592000,
      totalRecords: 649,
      supportedInputs: ['COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'Conservation Units',
    category: 'environmental',
    description: 'Verifica se coordenadas caem em Unidade de Conservação (ICMBio)',
    dataSourceUrl: 'https://geoserver.icmbio.gov.br/',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 9,
    config: {
      cacheTTL: 2592000,
      totalRecords: 0,
      supportedInputs: ['COORDINATES', 'ADDRESS']
    }
  },
  {
    name: 'INPE Fire Hotspots',
    category: 'environmental',
    description: 'Focos de calor/queimadas detectados por satélites (últimos 90 dias)',
    dataSourceUrl: 'https://dataserver-coids.inpe.br/',
    lastUpdated: new Date('2026-02-02'),
    isActive: true,
    priority: 8,
    config: {
      cacheTTL: 3600,
      supportedInputs: ['COORDINATES', 'CAR', 'ADDRESS']
    }
  },
  {
    name: 'ANA Water Use Permits',
    category: 'environmental',
    description: 'Outorgas de uso de recursos hídricos (ANA)',
    dataSourceUrl: 'https://dadosabertos.ana.gov.br/',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 6,
    config: {
      cacheTTL: 86400,
      totalRecords: 48179,
      supportedInputs: ['COORDINATES', 'CAR', 'ADDRESS']
    }
  },

  // OPTIONAL/FUTURE CHECKERS
  {
    name: 'MAPA Organic Certification',
    category: 'certification',
    description: 'Certificação orgânica (Ministério da Agricultura)',
    dataSourceUrl: 'https://www.gov.br/agricultura/',
    lastUpdated: new Date('2026-02-01'),
    isActive: true,
    priority: 5,
    config: {
      cacheTTL: 2592000,
      supportedInputs: ['CNPJ']
    }
  }
];

async function seed() {
  logger.info('Seeding checker sources...');

  try {
    for (const source of sources) {
      await db
        .insert(checkerSources)
        .values(source)
        .onConflictDoUpdate({
          target: checkerSources.name,
          set: {
            category: source.category,
            description: source.description,
            dataSourceUrl: source.dataSourceUrl,
            lastUpdated: source.lastUpdated,
            isActive: source.isActive,
            priority: source.priority,
            config: source.config,
            updatedAt: new Date()
          }
        });
      logger.info({ name: source.name }, 'Source seeded/updated');
    }

    logger.info(`Seeding completed! ${sources.length} sources processed.`);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Seeding failed');
    process.exit(1);
  }
}

seed();
