/**
 * Seed REPSAL Argentina
 *
 * Baixa e popula o Registro Público de Empleadores con Sanciones Laborales (REPSAL)
 * — equivalente argentino da Lista Suja do Trabalho Escravo.
 *
 * Fonte: http://repsal.trabajo.gob.ar/Sancion/GenerarExcel?OrganismoSancionadorId=0
 * Auth: Nenhuma
 *
 * ATENÇÃO: O servidor REPSAL pode bloquear IPs fora da Argentina.
 * Se o download falhar, use uma VPN/VPS argentina ou baixe o Excel manualmente
 * e execute: npx tsx scripts/seed-repsal-argentina.ts --file=repsal.xls
 *
 * Uso:
 *   npx tsx scripts/seed-repsal-argentina.ts              # Download + seed automático
 *   npx tsx scripts/seed-repsal-argentina.ts --clean      # Limpa tabela antes de inserir
 *   npx tsx scripts/seed-repsal-argentina.ts --file=repsal.xls  # Usa arquivo local
 */

import 'dotenv/config';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../src/db/client.js';
import { repsalSanciones } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

const REPSAL_URL = 'http://repsal.trabajo.gob.ar/Sancion/GenerarExcel?OrganismoSancionadorId=0';
const TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const clean  = args.includes('--clean');
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];

// --- Column mapping (Excel headers → DB fields) ---
// Columns verified from April 2025 REPSAL export
const COL = {
  CUIT:                    'Cuit',
  RAZON_SOCIAL:            'Razón Social',
  PROVINCIA:               'Provincia',
  LOCALIDAD:               'Localidad',
  ACTIVIDAD:               'Actividad',
  TIPO_INFRACCION:         'Tipo de Infracción',
  EMPLEADOS_REGISTRADOS:   'Empleados Registrados',
  ORGANISMO_PUBLICADOR:    'Organismo Publicador',
  ORGANISMO_SANCIONADOR:   'Organismo Sancionador',
  FECHA_INGRESO:           'Fecha de Ingreso',
  FIN_PUBLICACION:         'Fin de Publicación',
  NUMERO_EXPEDIENTE:       'Número de Expediente'
};

function normalizeCuit(raw: unknown): string {
  return String(raw ?? '').replace(/[^0-9]/g, '').padStart(11, '0').slice(-11);
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' || s === 'undefined' ? null : s;
}

function num(v: unknown): number | null {
  const n = parseInt(String(v ?? ''), 10);
  return isNaN(n) ? null : n;
}

async function downloadRepsal(): Promise<Buffer> {
  console.log(`Downloading REPSAL from ${REPSAL_URL} ...`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(REPSAL_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DeFarm/1.0)',
        'Accept': 'application/vnd.ms-excel,*/*'
      }
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf);
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — server may be blocking non-Argentine IPs. Use --file= with a manually downloaded Excel.');
    }
    throw err;
  }
}

async function parseExcel(buf: Buffer): Promise<any[]> {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`Parsed ${rows.length} rows from Excel`);
  return rows;
}

async function seed(rows: any[]): Promise<void> {
  if (clean) {
    console.log('Cleaning repsal_sanciones table...');
    await db.execute(sql`DELETE FROM repsal_sanciones WHERE country = 'AR'`);
  }

  let inserted = 0;
  let skipped  = 0;

  for (const row of rows) {
    const cuit = normalizeCuit(row[COL.CUIT]);
    if (cuit.length !== 11 || cuit === '00000000000') {
      skipped++;
      continue;
    }

    try {
      await db.insert(repsalSanciones).values({
        cuit,
        razonSocial:          str(row[COL.RAZON_SOCIAL]) ?? 'N/D',
        provincia:            str(row[COL.PROVINCIA]),
        localidad:            str(row[COL.LOCALIDAD]),
        actividad:            str(row[COL.ACTIVIDAD]),
        tipoInfraccion:       str(row[COL.TIPO_INFRACCION]),
        empleadosRegistrados: num(row[COL.EMPLEADOS_REGISTRADOS]),
        organismoSancionador: str(row[COL.ORGANISMO_SANCIONADOR]),
        organismoPublicador:  str(row[COL.ORGANISMO_PUBLICADOR]),
        fechaIngreso:         str(row[COL.FECHA_INGRESO]),
        finPublicacion:       str(row[COL.FIN_PUBLICACION]),
        numeroExpediente:     str(row[COL.NUMERO_EXPEDIENTE]),
        country:              'AR'
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      console.warn(`Skipping CUIT ${cuit}:`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`✅ Inserted: ${inserted} | Skipped: ${skipped}`);
}

async function main(): Promise<void> {
  console.log('=== REPSAL Argentina Seed ===');

  let buf: Buffer;

  if (fileArg) {
    const filePath = path.resolve(fileArg);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    console.log(`Reading from local file: ${filePath}`);
    buf = fs.readFileSync(filePath);
  } else {
    buf = await downloadRepsal();
  }

  const rows = await parseExcel(buf);

  if (rows.length === 0) {
    console.warn('No rows found in Excel. The sheet may be empty or column headers changed.');
    process.exit(0);
  }

  await seed(rows);

  const [{ value: total }] = await db.execute<{ value: number }>(
    sql`SELECT COUNT(*) as value FROM repsal_sanciones WHERE country = 'AR'`
  );
  console.log(`Total records in DB: ${total}`);
  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error('');
  console.error('If the download failed due to IP blocking, try:');
  console.error('  1. Download manually from http://repsal.trabajo.gob.ar/Sancion/GenerarExcel');
  console.error('  2. Then run: npx tsx scripts/seed-repsal-argentina.ts --file=repsal.xls');
  process.exit(1);
});
