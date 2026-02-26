#!/usr/bin/env tsx
import { createServer } from '../src/api/server.js';
import { db } from '../src/db/client.js';
import { apiKeys } from '../src/db/schema.js';
import { closeDatabase } from '../src/db/client.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cacheService } from '../src/services/cache.js';

const CHECKER_SOURCES = [
  'PRODES Deforestation',
  'DETER Real-Time Alerts',
  'CAR - Cadastro Ambiental Rural'
];

async function mkKey() {
  const raw = `ck_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = raw.slice(3, 15);
  const keyHash = await bcrypt.hash(raw, 10);
  await db.insert(apiKeys).values({
    name: 'Smoke Fast SourceType Key',
    keyPrefix,
    keyHash,
    isActive: true,
    permissions: ['read'],
    rateLimit: 1000,
    createdBy: 'smoke-fast'
  });
  return raw;
}

function parseCoordsFromTestUrl(url?: string): { lat: number; lon: number } | null {
  if (!url) return null;
  try {
    const u = new URL(url, 'http://localhost');
    const type = u.searchParams.get('type');
    const value = u.searchParams.get('value');
    if (type !== 'COORDINATES' || !value) return null;
    const [lat, lon] = value.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

async function getCandidateCoords(app: any): Promise<Array<{lat:number;lon:number}>> {
  const candidates: Array<{lat:number;lon:number}> = [
    { lat: -3.204065, lon: -52.209961 },
    { lat: -12.9714, lon: -51.7956 }
  ];

  for (const endpoint of ['/samples/prodes', '/samples/deter']) {
    const res = await app.inject({ method: 'GET', url: endpoint });
    if (res.statusCode !== 200) continue;
    const body = JSON.parse(res.body);
    const samples = Array.isArray(body.samples) ? body.samples : [];
    for (const s of samples.slice(0, 5)) {
      const fromUrl = parseCoordsFromTestUrl(s?.testUrl);
      if (fromUrl) candidates.push(fromUrl);
      if (Number.isFinite(s?.lat) && Number.isFinite(s?.lon)) {
        candidates.push({ lat: Number(s.lat), lon: Number(s.lon) });
      }
      if (Number.isFinite(s?.coordinates?.lat) && Number.isFinite(s?.coordinates?.lon)) {
        candidates.push({ lat: Number(s.coordinates.lat), lon: Number(s.coordinates.lon) });
      }
    }
  }

  return candidates;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SMOKE_SKIPPED: DATABASE_URL not configured');
    process.exit(0);
  }

  const app = await createServer();
  await app.ready();
  const apiKey = await mkKey();
  const candidates = await getCandidateCoords(app);

  let foundMixed = false;

  for (const coords of candidates) {
    const res = await app.inject({
      method: 'POST',
      url: '/check',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      payload: {
        input: { type: 'COORDINATES', value: coords },
        options: { sources: CHECKER_SOURCES }
      }
    });

    if (res.statusCode !== 200) {
      console.log(`status=${res.statusCode} coords=${coords.lat},${coords.lon}`);
      continue;
    }

    const data = JSON.parse(res.body);
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const direct = sources.filter((s: any) => s.sourceType === 'direct').length;
    const derived = sources.filter((s: any) => s.sourceType === 'derived').length;
    console.log(`coords=${coords.lat},${coords.lon} direct=${direct} derived=${derived} total=${sources.length}`);

    if (direct > 0 && derived > 0) {
      foundMixed = true;
      break;
    }
  }

  await app.close();
  await cacheService.close();
  await closeDatabase();

  if (!foundMixed) {
    console.error('SMOKE_FAIL: no direct+derived mix found with selected sources');
    process.exit(1);
  }

  console.log('SMOKE_OK: found direct+derived mix in /check');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
