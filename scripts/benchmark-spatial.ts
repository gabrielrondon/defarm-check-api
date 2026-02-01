#!/usr/bin/env tsx
/**
 * Benchmark de queries geoespaciais (PostGIS)
 *
 * Testa performance de ST_Intersects, ST_Contains com dados reais:
 * - Terras Indígenas (649 polígonos)
 * - PRODES (5 samples)
 * - Unidades de Conservação (se disponível)
 * - DETER (se disponível)
 *
 * Métricas:
 * - Tempo de execução (min, max, avg, p95, p99)
 * - Uso de índice GIST (EXPLAIN ANALYZE)
 * - Cache hit rate
 */

import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
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

interface BenchmarkResult {
  query: string;
  iterations: number;
  times: number[];
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
  usesIndex: boolean;
}

// Coordenadas de teste (dentro de diferentes regiões do Brasil)
const TEST_COORDINATES = [
  { name: 'Amazônia (AM)', lat: -3.1190, lon: -60.0217 },
  { name: 'Acre (AC)', lat: -9.0238, lon: -70.8120 },
  { name: 'Roraima (RR)', lat: 2.8235, lon: -60.6758 },
  { name: 'Mato Grosso (MT)', lat: -12.6819, lon: -56.9211 },
  { name: 'Pará (PA)', lat: -5.5294, lon: -52.9990 },
  { name: 'Sul (RS)', lat: -27.5954, lon: -48.5480 },
  { name: 'Nordeste (PE)', lat: -8.0476, lon: -34.8770 },
  { name: 'Centro-Oeste (GO)', lat: -15.8267, lon: -47.9218 }
];

async function benchmarkQuery(
  queryName: string,
  queryFn: (lat: number, lon: number) => Promise<any>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  logger.info(`🔧 Benchmarking: ${queryName}`);

  const times: number[] = [];

  // Warmup (não conta no resultado)
  for (let i = 0; i < 10; i++) {
    const coord = TEST_COORDINATES[i % TEST_COORDINATES.length];
    await queryFn(coord.lat, coord.lon);
  }

  // Benchmark real
  for (let i = 0; i < iterations; i++) {
    const coord = TEST_COORDINATES[i % TEST_COORDINATES.length];
    const start = performance.now();
    await queryFn(coord.lat, coord.lon);
    const elapsed = performance.now() - start;
    times.push(elapsed);

    if ((i + 1) % 20 === 0) {
      logger.info(`Progress: ${i + 1}/${iterations}`);
    }
  }

  // Calcular estatísticas
  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  // Verificar uso de índice com EXPLAIN ANALYZE
  const coord = TEST_COORDINATES[0];
  const explainResult = await checkIndexUsage(queryName, coord.lat, coord.lon);

  return {
    query: queryName,
    iterations,
    times,
    min,
    max,
    avg,
    p95,
    p99,
    usesIndex: explainResult
  };
}

async function checkIndexUsage(queryName: string, lat: number, lon: number): Promise<boolean> {
  try {
    let explainQuery = '';

    if (queryName.includes('Terras Indígenas')) {
      explainQuery = `
        EXPLAIN ANALYZE
        SELECT name FROM terras_indigenas
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1
      `;
    } else if (queryName.includes('PRODES')) {
      explainQuery = `
        EXPLAIN ANALYZE
        SELECT municipality FROM prodes_deforestation
        WHERE ST_Contains(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1
      `;
    } else if (queryName.includes('Unidades')) {
      explainQuery = `
        EXPLAIN ANALYZE
        SELECT name FROM unidades_conservacao
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1
      `;
    } else {
      return false;
    }

    const result = await db.execute(sql.raw(explainQuery));
    const plan = result.rows.map((r: any) => r['QUERY PLAN']).join('\n');

    // Verificar se usa índice GIST (Index Scan em geometry = índice GIST)
    const usesIndex = plan.toLowerCase().includes('index scan') &&
                      plan.toLowerCase().includes('geometry');

    logger.info('EXPLAIN ANALYZE', {
      query: queryName,
      usesIndex,
      plan: plan.split('\n').slice(0, 5).join('\n') // primeiras 5 linhas
    });

    return usesIndex;
  } catch (err) {
    logger.error('Failed to check index usage', { err });
    return false;
  }
}

async function main() {
  logger.info('🚀 Starting Spatial Queries Benchmark\n');

  // Verificar dados disponíveis
  const tiCount = await db.execute(sql`SELECT COUNT(*) as count FROM terras_indigenas`);
  const prodesCount = await db.execute(sql`SELECT COUNT(*) as count FROM prodes_deforestation`);
  const ucCount = await db.execute(sql`SELECT COUNT(*) as count FROM unidades_conservacao`);
  const deterCount = await db.execute(sql`SELECT COUNT(*) as count FROM deter_alerts`);

  logger.info('📊 Available datasets', {
    terrasIndigenas: tiCount.rows[0].count,
    prodes: prodesCount.rows[0].count,
    unidadesConservacao: ucCount.rows[0].count,
    deter: deterCount.rows[0].count
  });

  const results: BenchmarkResult[] = [];

  // Benchmark 1: Terras Indígenas (ST_Intersects)
  if (Number(tiCount.rows[0].count) > 0) {
    const tiResult = await benchmarkQuery(
      'Terras Indígenas - ST_Intersects',
      async (lat, lon) => {
        return await db.execute(sql`
          SELECT name, etnia, phase
          FROM terras_indigenas
          WHERE ST_Intersects(
            geometry,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          )
          LIMIT 1
        `);
      },
      100
    );
    results.push(tiResult);
  }

  // Benchmark 2: PRODES (ST_Contains)
  if (Number(prodesCount.rows[0].count) > 0) {
    const prodesResult = await benchmarkQuery(
      'PRODES - ST_Contains',
      async (lat, lon) => {
        return await db.execute(sql`
          SELECT municipality, state, area_ha, year
          FROM prodes_deforestation
          WHERE ST_Contains(
            geometry,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          )
          LIMIT 1
        `);
      },
      100
    );
    results.push(prodesResult);
  }

  // Benchmark 3: Unidades de Conservação (se disponível)
  if (Number(ucCount.rows[0].count) > 0) {
    const ucResult = await benchmarkQuery(
      'Unidades Conservação - ST_Intersects',
      async (lat, lon) => {
        return await db.execute(sql`
          SELECT name, category, "group"
          FROM unidades_conservacao
          WHERE ST_Intersects(
            geometry,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          )
          LIMIT 1
        `);
      },
      100
    );
    results.push(ucResult);
  }

  // Resultados finais
  console.log('\n' + '='.repeat(80));
  console.log('📈 BENCHMARK RESULTS');
  console.log('='.repeat(80) + '\n');

  for (const result of results) {
    console.log(`\n🔍 ${result.query}`);
    console.log(`   Iterations: ${result.iterations}`);
    console.log(`   Min: ${result.min.toFixed(2)}ms`);
    console.log(`   Max: ${result.max.toFixed(2)}ms`);
    console.log(`   Avg: ${result.avg.toFixed(2)}ms`);
    console.log(`   P95: ${result.p95.toFixed(2)}ms`);
    console.log(`   P99: ${result.p99.toFixed(2)}ms`);
    console.log(`   Uses GIST Index: ${result.usesIndex ? '✅' : '❌'}`);
  }

  // Recomendações
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(80) + '\n');

  for (const result of results) {
    if (!result.usesIndex) {
      console.log(`⚠️  ${result.query}: Index not being used! Create GIST index.`);
    }

    if (result.p95 > 1000) {
      console.log(`⚠️  ${result.query}: P95 > 1s. Consider increasing checker timeout.`);
    }

    if (result.p95 > 100 && result.p95 < 500) {
      console.log(`✅ ${result.query}: Good performance (P95: ${result.p95.toFixed(0)}ms)`);
    }

    if (result.p95 < 100) {
      console.log(`🚀 ${result.query}: Excellent performance (P95: ${result.p95.toFixed(0)}ms)`);
    }
  }

  console.log('\n');
  process.exit(0);
}

main().catch(err => {
  logger.error('Benchmark failed', { err });
  process.exit(1);
});
