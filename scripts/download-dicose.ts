#!/usr/bin/env tsx
/**
 * Script para baixar dados DICOSE (Livestock Registry) do Uruguay
 *
 * Fonte: DICOSE - MGAP (Ministerio de Ganadería, Agricultura y Pesca)
 * URL: https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024
 *
 * O que é DICOSE:
 * - Censo pecuário nacional (anual)
 * - Declaração obrigatória para todos os estabelecimentos rurais
 * - 44 CSVs por ano com dados completos
 *
 * Principais arquivos:
 * - Datos Generales: Dados gerais do estabelecimento
 * - Datos Animales: Contagem de animais por espécie
 * - Tenencia Tierra: Área explorada
 * - Uso Suelo: Uso do solo
 *
 * Uso:
 *   npm run data:dicose -- --year=2024
 *   npm run data:dicose -- --year=2024 --files=general,animales
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

const DATA_DIR = path.join(process.cwd(), 'data', 'uruguay', 'dicose');

// URLs dos datasets DICOSE por ano
const DICOSE_DATASETS: Record<number, string> = {
  2024: 'https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024',
  2023: 'https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2023',
  2022: 'https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2022'
};

// Arquivos prioritários para download
const PRIORITY_FILES = [
  'DatosGenerales',      // Dados gerais do estabelecimento (ID, RUC, área, departamento)
  'DatosAnimales',       // Contagem de animales por espécie
  'TenenciaTierra',      // Área explorada
  'UsoSuelo',            // Uso do solo
  'TablaCodigosDpto'     // Códigos de departamentos
];

interface DownloadOptions {
  year: number;
  files?: string[];
}

async function downloadDICOSE(options: DownloadOptions): Promise<void> {
  const { year, files = PRIORITY_FILES } = options;

  logger.info(`Downloading DICOSE data for year ${year}`);

  // Criar diretório
  const yearDir = path.join(DATA_DIR, year.toString());
  await fs.mkdir(yearDir, { recursive: true });

  const datasetUrl = DICOSE_DATASETS[year];
  if (!datasetUrl) {
    throw new Error(`No DICOSE dataset URL configured for year ${year}`);
  }

  logger.info(`
========================================
  DICOSE DATA DOWNLOAD
========================================

Year: ${year}
Dataset: ${datasetUrl}
Output: ${yearDir}

IMPORTANT: DICOSE data must be downloaded manually from the catalog.

Steps:
1. Visit: ${datasetUrl}
2. Download priority CSV files:
   ${PRIORITY_FILES.map(f => `   - ${f}.csv`).join('\n')}

3. Place downloaded files in: ${yearDir}/

4. Run seed script: npm run seed:dicose -- --year=${year}

Why manual download?
- DICOSE portal requires interactive CSV download (no direct API)
- 44 CSV files per year (we need only 4-5 key files)
- Files are updated annually in March

Alternative: Download all 44 files as ZIP if available.

Contact: datos@mgap.gub.uy for bulk data access
  `);

  // Verificar se arquivos já existem
  logger.info('Checking for existing files...');
  let foundCount = 0;

  for (const file of PRIORITY_FILES) {
    const csvPath = path.join(yearDir, `${file}.csv`);
    try {
      await fs.access(csvPath);
      foundCount++;
      logger.info(`✓ Found: ${file}.csv`);
    } catch {
      logger.warn(`✗ Missing: ${file}.csv`);
    }
  }

  if (foundCount === PRIORITY_FILES.length) {
    logger.info(`✓ All ${foundCount} priority files found!`);
    logger.info('  Ready to seed. Run: npm run seed:dicose');
  } else if (foundCount > 0) {
    logger.info(`⚠ Found ${foundCount}/${PRIORITY_FILES.length} files. Missing ${PRIORITY_FILES.length - foundCount}.`);
  } else {
    logger.info('⚠ No files found. Please download manually from catalog.');
  }
}

// Parse args
const args = process.argv.slice(2);
const yearArg = args.find(a => a.startsWith('--year='));
const filesArg = args.find(a => a.startsWith('--files='));

const year = yearArg ? parseInt(yearArg.split('=')[1]) : 2024;
const files = filesArg ? filesArg.split('=')[1].split(',') : undefined;

// Executar
downloadDICOSE({ year, files }).catch((err) => {
  logger.error('Failed to download DICOSE data', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});
