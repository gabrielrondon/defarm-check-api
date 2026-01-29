#!/usr/bin/env tsx
/**
 * Cron Job: Verificação de Freshness dos Dados
 *
 * Frequência: DIÁRIA (08:00)
 * Cron: 0 8 * * *
 *
 * O que faz:
 * 1. Verifica idade dos dados em cada fonte
 * 2. Compara com SLA esperado
 * 3. Alerta se dados estão obsoletos
 * 4. Log de métricas de freshness
 */

import { db } from '../../src/db/client.js';
import { sql } from 'drizzle-orm';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message }) => {
          const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
          return `[${ts}] ${level}: ${message}`;
        })
      )
    }),
    new transports.File({
      filename: 'logs/cron-health.log',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

interface DataSource {
  name: string;
  table: string;
  slaMaxDays: number;  // SLA máximo de freshness em dias
  description: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: 'Lista Suja',
    table: 'lista_suja',
    slaMaxDays: 35,  // Atualização mensal + 5 dias de margem
    description: 'Trabalho escravo (MTE)'
  },
  {
    name: 'IBAMA Embargoes',
    table: 'ibama_embargoes',
    slaMaxDays: 10,  // Atualização semanal + 3 dias de margem
    description: 'Embargos ambientais'
  },
  {
    name: 'DETER Alerts',
    table: 'deter_alerts',
    slaMaxDays: 2,  // Atualização diária + 1 dia de margem
    description: 'Alertas de desmatamento'
  },
  {
    name: 'Terras Indígenas',
    table: 'terras_indigenas',
    slaMaxDays: 35,  // Atualização mensal
    description: 'Demarcações FUNAI'
  },
  {
    name: 'Unidades de Conservação',
    table: 'unidades_conservacao',
    slaMaxDays: 35,  // Atualização mensal
    description: 'Áreas protegidas ICMBio'
  },
  {
    name: 'CAR',
    table: 'car_registrations',
    slaMaxDays: 35,  // Atualização mensal
    description: 'Cadastro Ambiental Rural'
  }
];

interface FreshnessResult {
  source: DataSource;
  lastUpdate: Date | null;
  ageInDays: number;
  status: 'FRESH' | 'STALE' | 'CRITICAL';
  totalRecords: number;
}

async function checkSourceFreshness(source: DataSource): Promise<FreshnessResult> {
  try {
    // Query para obter última atualização e total de registros
    const query = `
      SELECT
        MAX(created_at) as last_update,
        COUNT(*) as total
      FROM ${source.table}
    `;

    const result = await db.execute(sql.raw(query));
    const row = result.rows[0];

    const lastUpdate = row.last_update ? new Date(row.last_update as string) : null;
    const totalRecords = Number(row.total) || 0;

    if (!lastUpdate) {
      return {
        source,
        lastUpdate: null,
        ageInDays: Infinity,
        status: 'CRITICAL',
        totalRecords
      };
    }

    const now = new Date();
    const ageInMs = now.getTime() - lastUpdate.getTime();
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

    let status: 'FRESH' | 'STALE' | 'CRITICAL';

    if (ageInDays <= source.slaMaxDays) {
      status = 'FRESH';
    } else if (ageInDays <= source.slaMaxDays * 1.5) {
      status = 'STALE';
    } else {
      status = 'CRITICAL';
    }

    return {
      source,
      lastUpdate,
      ageInDays,
      status,
      totalRecords
    };

  } catch (error) {
    logger.error(`Failed to check freshness for ${source.name}`, { error });

    return {
      source,
      lastUpdate: null,
      ageInDays: Infinity,
      status: 'CRITICAL',
      totalRecords: 0
    };
  }
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('Starting data freshness check');
  logger.info('='.repeat(60));

  const results: FreshnessResult[] = [];

  for (const source of DATA_SOURCES) {
    const result = await checkSourceFreshness(source);
    results.push(result);

    const emoji = result.status === 'FRESH' ? '✅' : result.status === 'STALE' ? '⚠️' : '❌';

    logger.info(`${emoji} ${result.source.name}`, {
      status: result.status,
      ageInDays: result.ageInDays,
      slaMaxDays: result.source.slaMaxDays,
      lastUpdate: result.lastUpdate?.toISOString(),
      totalRecords: result.totalRecords
    });
  }

  // Resumo
  const fresh = results.filter(r => r.status === 'FRESH').length;
  const stale = results.filter(r => r.status === 'STALE').length;
  const critical = results.filter(r => r.status === 'CRITICAL').length;

  logger.info('='.repeat(60));
  logger.info('Freshness Summary', {
    total: results.length,
    fresh,
    stale,
    critical
  });
  logger.info('='.repeat(60));

  // TODO: Enviar alerta Telegram se houver fontes CRITICAL ou STALE
  if (critical > 0) {
    logger.error('CRITICAL: Data sources are severely outdated!', {
      sources: results.filter(r => r.status === 'CRITICAL').map(r => r.source.name)
    });
  }

  if (stale > 0) {
    logger.warn('WARNING: Data sources are getting stale', {
      sources: results.filter(r => r.status === 'STALE').map(r => r.source.name)
    });
  }

  // Exit code: 0 = tudo OK, 1 = tem STALE, 2 = tem CRITICAL
  if (critical > 0) {
    process.exit(2);
  } else if (stale > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

export { main as checkDataFreshness };
