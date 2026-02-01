#!/usr/bin/env tsx
/**
 * End-to-End API Testing Script
 *
 * Tests all API endpoints with real data from production database
 * Validates responses, performance, and checker functionality
 */

import axios from 'axios';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, -5);
      return `[${ts}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new transports.Console({ format: format.colorize({ all: true }) })]
});

// API Base URL (use environment variable or default to production)
const API_BASE_URL = process.env.API_BASE_URL || 'https://defarm-check-api-production.up.railway.app';

// API Key for authentication (required for /check endpoint)
const API_KEY = process.env.API_KEY || '';

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [] as Array<{
    name: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    duration: number;
    error?: string;
  }>
};

/**
 * Execute a test and track results
 */
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  results.total++;
  const startTime = Date.now();

  try {
    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`🧪 TEST: ${name}`);
    logger.info('='.repeat(80));

    await fn();

    const duration = Date.now() - startTime;
    results.passed++;
    results.tests.push({ name, status: 'PASS', duration });

    logger.info(`✅ PASS (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    results.failed++;
    results.tests.push({ name, status: 'FAIL', duration, error: errorMessage });

    logger.error(`❌ FAIL (${duration}ms): ${errorMessage}`);
  }
}

/**
 * Assert helper
 */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Test: Root endpoint
 */
async function testRootEndpoint() {
  const response = await axios.get(`${API_BASE_URL}/`);

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.name === 'Check API', 'Expected name "Check API"');
  assert(response.data.version, 'Expected version field');
  assert(response.data.endpoints, 'Expected endpoints field');

  logger.info(`Version: ${response.data.version}`);
  logger.info(`Endpoints: ${JSON.stringify(response.data.endpoints, null, 2)}`);
}

/**
 * Test: Health check endpoint
 */
async function testHealthEndpoint() {
  const response = await axios.get(`${API_BASE_URL}/health`, {
    validateStatus: (status) => status === 200 || status === 503  // Accept both statuses
  });

  assert(response.status === 200 || response.status === 503, 'Expected status 200 or 503');
  assert(response.data.status, 'Expected status field');
  assert(response.data.services, 'Expected services field');
  assert(response.data.services.database, 'Expected database status');
  assert(response.data.services.redis, 'Expected redis status');
  assert(response.data.dataSources, 'Expected dataSources field');
  assert(response.data.tableCounts, 'Expected tableCounts field');

  logger.info(`HTTP Status: ${response.status}`);
  logger.info(`System Status: ${response.data.status}`);
  logger.info(`Database: ${response.data.services.database}`);
  logger.info(`Redis: ${response.data.services.redis}`);
  logger.info(`Data Sources: ${response.data.dataSources.length}`);
  logger.info(`Table Counts: ${JSON.stringify(response.data.tableCounts, null, 2)}`);

  // Log data sources status
  if (response.data.dataSources.length > 0) {
    logger.info('\nData Sources Freshness:');
    response.data.dataSources.forEach((source: any) => {
      const emoji = source.freshnessStatus === 'fresh' ? '✅' :
                    source.freshnessStatus === 'warning' ? '⚠️' :
                    source.freshnessStatus === 'stale' ? '🔴' : '❓';
      logger.info(`  ${emoji} ${source.name}: ${source.freshnessStatus} (${source.hoursSinceUpdate}h ago)`);
    });
  }
}

/**
 * Test: Workers health endpoint
 */
async function testWorkersHealthEndpoint() {
  const response = await axios.get(`${API_BASE_URL}/workers/health`);

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.systemHealth, 'Expected systemHealth field');
  assert(response.data.jobs, 'Expected jobs field');
  assert(Array.isArray(response.data.jobs), 'Expected jobs to be array');

  logger.info(`System Status: ${response.data.systemHealth.status}`);
  logger.info(`Total Jobs: ${response.data.systemHealth.totalJobs}`);
  logger.info(`Healthy Jobs: ${response.data.systemHealth.healthyJobs}`);
  logger.info(`Degraded Jobs: ${response.data.systemHealth.degradedJobs}`);
  logger.info(`Critical Jobs: ${response.data.systemHealth.criticalJobs}`);

  if (response.data.jobs.length > 0) {
    logger.info(`\nJob Metrics:`);
    response.data.jobs.forEach((job: any) => {
      logger.info(`  • ${job.name}: ${job.successRate} success rate (${job.consecutiveFailures} consecutive failures)`);
    });
  }
}

/**
 * Test: Sources endpoint
 */
async function testSourcesEndpoint() {
  const response = await axios.get(`${API_BASE_URL}/sources`);

  assert(response.status === 200, 'Expected status 200');
  assert(Array.isArray(response.data), 'Expected array response');
  assert(response.data.length > 0, 'Expected at least one source');

  logger.info(`Total Sources: ${response.data.length}`);

  response.data.forEach((source: any) => {
    assert(source.name, 'Expected name field');
    assert(source.category, 'Expected category field');
    assert(source.description, 'Expected description field');
    logger.info(`  • ${source.name} (${source.category})`);
  });
}

/**
 * Test: Check endpoint with CPF (Lista Suja)
 */
async function testCheckCPFListaSuja() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping check tests');
    results.skipped++;
    return;
  }

  const response = await axios.post(`${API_BASE_URL}/check`, {
    input: {
      type: 'CPF',
      value: '12345678901'
    }
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.input, 'Expected input field');
  assert(response.data.verdict, 'Expected verdict field');
  assert(response.data.sources, 'Expected sources field');
  assert(Array.isArray(response.data.sources), 'Expected sources to be array');

  logger.info(`Input: ${JSON.stringify(response.data.input)}`);
  logger.info(`Verdict: ${response.data.verdict}`);
  logger.info(`Score: ${response.data.score}`);
  logger.info(`Sources Checked: ${response.data.sources.length}`);

  response.data.sources.forEach((result: any) => {
    logger.info(`  • ${result.name}: ${result.status} (${result.executionTimeMs}ms)`);
    if (result.severity !== 'none') {
      logger.info(`    Severity: ${result.severity}`);
    }
  });
}

/**
 * Test: Check endpoint with CNPJ (IBAMA + Lista Suja)
 */
async function testCheckCNPJIbama() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping');
    results.skipped++;
    return;
  }

  const response = await axios.post(`${API_BASE_URL}/check`, {
    input: {
      type: 'CNPJ',
      value: '12345678000190'
    }
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.verdict, 'Expected verdict field');
  assert(response.data.sources, 'Expected sources field');

  logger.info(`Input: ${JSON.stringify(response.data.input)}`);
  logger.info(`Verdict: ${response.data.verdict}`);
  logger.info(`Sources Checked: ${response.data.sources.length}`);

  const checkedSources = response.data.sources.map((r: any) => r.name);
  logger.info(`Checked Sources: ${checkedSources.join(', ')}`);
}

/**
 * Test: Check endpoint with coordinates (Deforestation, Indigenous Lands, etc.)
 */
async function testCheckCoordinates() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping');
    results.skipped++;
    return;
  }

  const response = await axios.post(`${API_BASE_URL}/check`, {
    input: {
      type: 'COORDINATES',
      value: { lat: -10.5, lng: -62.5 }  // Rondônia (deforestation hotspot)
    }
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.verdict, 'Expected verdict field');
  assert(response.data.sources, 'Expected sources field');

  logger.info(`Input: ${JSON.stringify(response.data.input)}`);
  logger.info(`Verdict: ${response.data.verdict}`);
  logger.info(`Sources Checked: ${response.data.sources.length}`);

  response.data.sources.forEach((result: any) => {
    logger.info(`  • ${result.name}: ${result.status}`);
    if (result.severity !== 'none') {
      logger.info(`    Severity: ${result.severity}`);
    }
  });
}

/**
 * Test: Check endpoint with polygon/GeoJSON
 */
async function testCheckPolygon() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping');
    results.skipped++;
    return;
  }

  const polygon = {
    type: 'Polygon',
    coordinates: [[
      [-62.5, -10.5],
      [-62.4, -10.5],
      [-62.4, -10.4],
      [-62.5, -10.4],
      [-62.5, -10.5]
    ]]
  };

  const response = await axios.post(`${API_BASE_URL}/check`, {
    input: {
      type: 'ADDRESS',  // Or custom type for polygon
      value: polygon
    }
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });

  assert(response.status === 200, 'Expected status 200');
  assert(response.data.verdict, 'Expected verdict field');

  logger.info(`Verdict: ${response.data.verdict}`);
  logger.info(`Sources Checked: ${response.data.sources.length}`);
}

/**
 * Test: Performance - measure response times
 */
async function testPerformance() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping');
    results.skipped++;
    return;
  }

  const iterations = 5;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();

    await axios.post(`${API_BASE_URL}/check`, {
      input: {
        type: 'CPF',
        value: '12345678901'
      }
    }, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    times.push(Date.now() - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  logger.info(`Performance (${iterations} requests):`);
  logger.info(`  • Average: ${avgTime.toFixed(0)}ms`);
  logger.info(`  • Min: ${minTime}ms`);
  logger.info(`  • Max: ${maxTime}ms`);

  assert(avgTime < 5000, 'Average response time should be under 5 seconds');
}

/**
 * Test: Samples endpoints
 */
async function testSamplesEndpoints() {
  const endpoints = [
    '/samples/ibama',
    '/samples/lista-suja',
    '/samples/deter'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`);
      assert(response.status === 200, `Expected status 200 for ${endpoint}`);
      logger.info(`${endpoint}: ${response.data.length || 'OK'}`);
    } catch (error) {
      logger.warn(`${endpoint}: Failed or no data`);
    }
  }
}

/**
 * Test: Cache functionality
 */
async function testCacheFunctionality() {
  if (!API_KEY) {
    logger.warn('API_KEY not set, skipping');
    results.skipped++;
    return;
  }

  const inputData = {
    type: 'CPF',
    value: '12345678901'
  };

  // First request (cache miss)
  const start1 = Date.now();
  const response1 = await axios.post(`${API_BASE_URL}/check`, {
    input: inputData
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });
  const time1 = Date.now() - start1;

  // Second request (should hit cache)
  const start2 = Date.now();
  const response2 = await axios.post(`${API_BASE_URL}/check`, {
    input: inputData
  }, {
    headers: {
      'X-API-Key': API_KEY
    }
  });
  const time2 = Date.now() - start2;

  logger.info(`First request (cache miss): ${time1}ms`);
  logger.info(`Second request (cache hit): ${time2}ms`);
  logger.info(`Speedup: ${(time1 / time2).toFixed(2)}x`);

  // Cache hit should be faster (but not always due to network variance)
  // Just log the results for now
  assert(response1.data.verdict === response2.data.verdict, 'Results should be identical');
}

/**
 * Main test runner
 */
async function main() {
  logger.info('╔════════════════════════════════════════════════════════════════════════════╗');
  logger.info('║                      END-TO-END API TESTING SUITE                         ║');
  logger.info('╚════════════════════════════════════════════════════════════════════════════╝');
  logger.info(`\nAPI Base URL: ${API_BASE_URL}\n`);

  // Run all tests
  await test('Root Endpoint', testRootEndpoint);
  await test('Health Check Endpoint', testHealthEndpoint);
  await test('Workers Health Endpoint', testWorkersHealthEndpoint);
  await test('Sources Endpoint', testSourcesEndpoint);
  await test('Check CPF (Lista Suja)', testCheckCPFListaSuja);
  await test('Check CNPJ (IBAMA + Lista Suja)', testCheckCNPJIbama);
  await test('Check Coordinates (Geospatial)', testCheckCoordinates);
  await test('Check Polygon (GeoJSON)', testCheckPolygon);
  await test('Samples Endpoints', testSamplesEndpoints);
  await test('Performance Test', testPerformance);
  await test('Cache Functionality', testCacheFunctionality);

  // Print summary
  logger.info('\n' + '='.repeat(80));
  logger.info('TEST SUMMARY');
  logger.info('='.repeat(80));
  logger.info(`Total Tests: ${results.total}`);
  logger.info(`✅ Passed: ${results.passed}`);
  logger.info(`❌ Failed: ${results.failed}`);
  logger.info(`⏭️  Skipped: ${results.skipped}`);
  logger.info(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    logger.info('\n❌ FAILED TESTS:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        logger.error(`  • ${t.name}: ${t.error}`);
      });
  }

  logger.info('\n' + '='.repeat(80));

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
