#!/usr/bin/env tsx
/**
 * Script para baixar dados COMPLETOS do PRODES de todos os biomas
 *
 * Fonte: TerraBrasilis (INPE)
 * URL: https://terrabrasilis.dpi.inpe.br/geoserver/ows
 *
 * Layers disponíveis:
 * - prodes-legal-amz:yearly_deforestation (Amazônia Legal - anual desde 2008)
 * - prodes-cerrado-nb:yearly_deforestation (Cerrado - baseline 2000 + anual)
 * - prodes-caatinga-nb:yearly_deforestation (Caatinga)
 * - prodes-mata-atlantica-nb:yearly_deforestation (Mata Atlântica)
 * - prodes-pampa-nb:yearly_deforestation (Pampa)
 * - prodes-pantanal-nb:yearly_deforestation (Pantanal)
 *
 * ATENÇÃO: Dataset muito grande! Estratégia:
 * 1. Download por bioma separadamente
 * 2. Filtro por ano (últimos 5 anos por padrão)
 * 3. Salva em arquivos separados para processamento batch
 *
 * Uso:
 *   npm run data:prodes-complete
 *   npm run data:prodes-complete -- --biome=amazonia --years=5
 *   npm run data:prodes-complete -- --all-years
 */

import fs from 'fs/promises';
import path from 'path';
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

interface BiomeConfig {
  layer: string;
  name: string;
  startYear: number; // Primeiro ano disponível
}

const BIOMES: Record<string, BiomeConfig> = {
  amazonia: {
    layer: 'prodes-legal-amz:yearly_deforestation',
    name: 'Amazônia Legal',
    startYear: 2008
  },
  cerrado: {
    layer: 'prodes-cerrado-nb:yearly_deforestation',
    name: 'Cerrado',
    startYear: 2000
  },
  caatinga: {
    layer: 'prodes-caatinga-nb:yearly_deforestation',
    name: 'Caatinga',
    startYear: 2008
  },
  'mata-atlantica': {
    layer: 'prodes-mata-atlantica-nb:yearly_deforestation',
    name: 'Mata Atlântica',
    startYear: 2008
  },
  pampa: {
    layer: 'prodes-pampa-nb:yearly_deforestation',
    name: 'Pampa',
    startYear: 2008
  },
  pantanal: {
    layer: 'prodes-pantanal-nb:yearly_deforestation',
    name: 'Pantanal',
    startYear: 2008
  }
};

async function downloadBiomeData(
  biomeKey: string,
  config: BiomeConfig,
  yearsBack: number | 'all'
): Promise<any> {
  const baseUrl = 'https://terrabrasilis.dpi.inpe.br/geoserver/ows';

  const currentYear = new Date().getFullYear();
  const startYear = yearsBack === 'all'
    ? config.startYear
    : Math.max(config.startYear, currentYear - yearsBack);

  logger.info(`Downloading ${config.name}`, {
    layer: config.layer,
    yearRange: `${startYear}-${currentYear}`,
    yearsCount: currentYear - startYear + 1
  });

  // Build WFS GetFeature request
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typename: config.layer,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326'
  });

  // Add year filter if not downloading all
  if (yearsBack !== 'all') {
    // CQL filter for recent years
    const yearFilter = `year >= ${startYear}`;
    params.append('CQL_FILTER', yearFilter);
  }

  const url = `${baseUrl}?${params.toString()}`;

  logger.info('Fetching from WFS', {
    url: url.substring(0, 150) + '...',
    estimatedSize: yearsBack === 'all' ? 'VERY LARGE (GB)' : 'LARGE (100s MB)'
  });

  try {
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DeFarm-Check-API/1.0'
      },
      signal: AbortSignal.timeout(600000) // 10 minutes timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const downloadTime = Math.round((Date.now() - startTime) / 1000);

    logger.info('Download completed', {
      biome: config.name,
      features: data.features?.length || 0,
      downloadTimeSeconds: downloadTime,
      downloadTimeMins: Math.round(downloadTime / 60)
    });

    return data;

  } catch (error) {
    logger.error('Failed to download biome data', {
      biome: config.name,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

async function saveToFile(data: any, biomeKey: string, yearsBack: number | 'all') {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const yearsSuffix = yearsBack === 'all' ? 'all' : `${yearsBack}y`;
  const filename = `prodes_${biomeKey}_${yearsSuffix}.json`;
  const filepath = path.join(dataDir, filename);

  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

  const fileStat = await fs.stat(filepath);
  const fileSizeMB = Math.round(fileStat.size / (1024 * 1024) * 10) / 10;

  logger.info('Saved to file', {
    filepath,
    features: data.features?.length || 0,
    fileSizeMB
  });

  return filepath;
}

async function downloadAll(biomeFilter?: string, yearsBack: number | 'all' = 5) {
  const startTime = Date.now();

  logger.info('Starting PRODES complete download', {
    biomeFilter: biomeFilter || 'ALL BIOMES',
    yearsBack: yearsBack === 'all' ? 'ALL YEARS' : `${yearsBack} years`,
    biomeCount: biomeFilter ? 1 : Object.keys(BIOMES).length
  });

  const results = {
    success: [] as { biome: string; file: string; features: number }[],
    failed: [] as { biome: string; error: string }[],
    totalFeatures: 0
  };

  const biomesToProcess = biomeFilter
    ? { [biomeFilter]: BIOMES[biomeFilter] }
    : BIOMES;

  if (biomeFilter && !BIOMES[biomeFilter]) {
    logger.error('Invalid biome filter', {
      provided: biomeFilter,
      available: Object.keys(BIOMES).join(', ')
    });
    throw new Error(`Unknown biome: ${biomeFilter}`);
  }

  for (const [biomeKey, config] of Object.entries(biomesToProcess)) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Processing biome: ${config.name}`);
      logger.info('='.repeat(60));

      const data = await downloadBiomeData(biomeKey, config, yearsBack);
      const filepath = await saveToFile(data, biomeKey, yearsBack);

      const featureCount = data.features?.length || 0;
      results.success.push({
        biome: config.name,
        file: path.basename(filepath),
        features: featureCount
      });
      results.totalFeatures += featureCount;

      // Delay between biomes to avoid overloading server
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      logger.error(`Failed to process ${config.name}`, {
        error: error instanceof Error ? error.message : error
      });
      results.failed.push({
        biome: config.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  logger.info('\n' + '='.repeat(60));
  logger.info('DOWNLOAD SUMMARY');
  logger.info('='.repeat(60));
  logger.info('Success:', {
    biomes: results.success.length,
    totalFeatures: results.totalFeatures,
    files: results.success.map(r => `${r.file} (${r.features.toLocaleString()} features)`).join(', ')
  });

  if (results.failed.length > 0) {
    logger.error('Failed:', {
      biomes: results.failed.length,
      list: results.failed.map(f => `${f.biome}: ${f.error}`).join('\n')
    });
  }

  logger.info('Execution time:', {
    totalSeconds: totalTime,
    minutes: Math.round(totalTime / 60)
  });

  logger.info('='.repeat(60));

  return results;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const biomeArg = args.find(arg => arg.startsWith('--biome='));
  const yearsArg = args.find(arg => arg.startsWith('--years='));
  const allYears = args.includes('--all-years');

  const biome = biomeArg?.split('=')[1];
  const years = allYears
    ? 'all'
    : yearsArg
      ? parseInt(yearsArg.split('=')[1])
      : 5;

  try {
    const results = await downloadAll(biome, years);

    if (results.failed.length > 0) {
      logger.warn(`⚠️  Completed with ${results.failed.length} failures`);
      process.exit(1);
    } else {
      logger.info('✅ All biomes downloaded successfully');
      process.exit(0);
    }
  } catch (error) {
    logger.error('❌ Download failed', { error });
    process.exit(1);
  }
}

// Run if this is the main module (ES modules)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { downloadAll };
