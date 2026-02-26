#!/usr/bin/env tsx
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

type SampleRecord = {
  testUrl?: string;
};

type SamplesAllResponse = Record<string, SampleRecord | null>;

const DEFAULT_BASE_URL = 'https://defarm-check-api-production.up.railway.app';

const baseUrl = (
  process.env.PRODUCTION_API_BASE_URL ||
  process.env.API_BASE_URL ||
  DEFAULT_BASE_URL
).replace(/\/$/, '');

const apiKey = process.env.PRODUCTION_API_KEY || process.env.API_KEY || '';
const requireAuthSmoke = String(process.env.REQUIRE_AUTH_SMOKE || 'false').toLowerCase() === 'true';
const sampleCheckLimit = Number(process.env.SAMPLE_CHECK_LIMIT || 4);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry<T>(
  config: AxiosRequestConfig,
  attempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await axios.request<T>({
        timeout: 20000,
        validateStatus: () => true,
        ...config
      });

      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }

      if (response.status < 500 || i === attempts) {
        throw new Error(
          `${config.method || 'GET'} ${config.url} returned ${response.status}: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      lastError = error;
      const isAxios = error instanceof AxiosError;
      const canRetry = isAxios ? !error.response || (error.response.status >= 500 && error.response.status <= 599) : true;
      if (!canRetry || i === attempts) {
        break;
      }
      await sleep(i * 1500);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

function parseCheckPayload(testUrl: string): unknown {
  const prefix = 'POST /check ';
  assert(testUrl.startsWith(prefix), `Unexpected sample testUrl format: ${testUrl}`);
  const bodyString = testUrl.slice(prefix.length).trim();
  return JSON.parse(bodyString);
}

async function run(): Promise<void> {
  console.log(`Launch smoke target: ${baseUrl}`);

  const root = await requestWithRetry<Record<string, unknown>>({
    method: 'GET',
    url: `${baseUrl}/`
  });
  assert(root.name === 'Check API', 'Root endpoint did not return expected service name');

  const healthResponse = await axios.get<{
    status?: string;
    services?: { database?: string; redis?: string };
  }>(`${baseUrl}/health`, {
    timeout: 20000,
    validateStatus: status => status === 200 || status === 503
  });
  const health = healthResponse.data;
  assert(health.services?.database, 'Health endpoint missing database status');
  assert(health.services.database !== 'down', 'Database is down according to /health');
  console.log(`Health status=${health.status || 'unknown'} db=${health.services.database} redis=${health.services.redis || 'unknown'}`);

  const sources = await requestWithRetry<unknown[]>({
    method: 'GET',
    url: `${baseUrl}/sources`
  });
  assert(Array.isArray(sources) && sources.length > 0, '/sources returned empty list');
  console.log(`Sources catalog size: ${sources.length}`);

  const derivedMetrics = await requestWithRetry<unknown[]>({
    method: 'GET',
    url: `${baseUrl}/insights/derived-rules?limit=5`
  });
  assert(Array.isArray(derivedMetrics), '/insights/derived-rules did not return an array');
  console.log(`Derived rules returned: ${derivedMetrics.length}`);

  const samples = await requestWithRetry<SamplesAllResponse>({
    method: 'GET',
    url: `${baseUrl}/samples/all`
  });

  const expectedSampleKeys = [
    'listaSuja',
    'ibama',
    'terrasIndigenas',
    'unidadesConservacao',
    'deter',
    'car',
    'prodes',
    'snap',
    'dicose'
  ];

  for (const key of expectedSampleKeys) {
    assert(key in samples, `/samples/all is missing key ${key}`);
  }

  const nonNullSamples = Object.entries(samples).filter(([, value]) => value !== null);
  assert(nonNullSamples.length >= 3, `Too few non-null sample sources available: ${nonNullSamples.length}`);

  const availableSamples = Object.entries(samples).filter(
    ([, value]) => Boolean(value?.testUrl)
  ) as Array<[string, SampleRecord]>;

  console.log(
    `Samples non-null=${nonNullSamples.length}, with testUrl=${availableSamples.length}/${expectedSampleKeys.length}`
  );

  if (!apiKey) {
    if (requireAuthSmoke) {
      throw new Error('PRODUCTION_API_KEY/API_KEY is required when REQUIRE_AUTH_SMOKE=true');
    }
    if (availableSamples.length < 3) {
      console.log('Auth smoke not executed and sample testUrl coverage is below target.');
    }
    console.log('Auth smoke skipped (no PRODUCTION_API_KEY/API_KEY set).');
    console.log('LAUNCH_SMOKE_OK (public checks only)');
    return;
  }

  assert(availableSamples.length >= 3, `Too few sample sources with testUrl for auth smoke: ${availableSamples.length}`);

  let authChecks = 0;
  for (const [sampleKey, sample] of availableSamples.slice(0, Math.max(1, sampleCheckLimit))) {
    const payload = parseCheckPayload(sample.testUrl as string);
    const check = await requestWithRetry<{ sources?: Array<{ sourceType?: string }> }>({
      method: 'POST',
      url: `${baseUrl}/check`,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    });

    const checkSources = check.sources || [];
    assert(checkSources.length > 0, `/check returned no sources for sample ${sampleKey}`);
    const hasDirect = checkSources.some(s => s.sourceType === 'direct');
    assert(hasDirect, `/check has no direct source in sample ${sampleKey}`);
    authChecks++;
    console.log(`Auth check ${authChecks}: sample=${sampleKey} sources=${checkSources.length}`);
  }

  console.log(`LAUNCH_SMOKE_OK (public + auth checks=${authChecks})`);
}

run().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`LAUNCH_SMOKE_FAILED: ${message}`);
  process.exit(1);
});
