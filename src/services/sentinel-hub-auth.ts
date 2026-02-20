/**
 * Sentinel Hub Authentication & Statistical API Service
 *
 * OAuth2 client_credentials → bearer token (cached até expirar)
 * Statistical API: calcula índices espectrais (BSI, NDWI, NDVI, NDMI)
 * sobre polígonos GeoJSON via evalscripts personalizados.
 *
 * Token endpoint: https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token
 * Statistical API: https://services.sentinel-hub.com/api/v1/statistics
 *
 * Credenciais: SENTINEL_HUB_CLIENT_ID + SENTINEL_HUB_CLIENT_SECRET
 */

import { logger } from '../utils/logger.js';

const TOKEN_URL  = 'https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token';
const STATS_URL  = 'https://services.sentinel-hub.com/api/v1/statistics';

// Token cache (module-level, shared across all checkers)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export function sentinelHubConfigured(): boolean {
  return !!(process.env.SENTINEL_HUB_CLIENT_ID && process.env.SENTINEL_HUB_CLIENT_SECRET);
}

export async function getSentinelHubToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId     = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET not configured');
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret
  });

  const response = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
    signal:  AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sentinel Hub token request failed: ${response.status} — ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken   = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 1 min safety margin

  logger.debug({ expiresIn: data.expires_in }, 'Sentinel Hub token refreshed');
  return cachedToken;
}

// GeoJSON geometry types accepted by Statistical API
export type SHGeometry =
  | { type: 'Polygon';    coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

// Statistical API response types
export interface SHBandStats {
  min: number;
  max: number;
  mean: number;
  stDev: number;
  sampleCount: number;
  noDataCount: number;
}

export interface SHStatsInterval {
  interval: { from: string; to: string };
  outputs: Record<string, {
    bands: Record<string, { stats: SHBandStats }>;
  }>;
}

export interface SHStatsResponse {
  data: SHStatsInterval[];
}

export interface SHStatsRequest {
  geometry:      SHGeometry;
  dataType:      'sentinel-2-l2a' | 'sentinel-1-grd';
  fromDate:      string;  // ISO8601
  toDate:        string;
  intervalDays:  number;  // aggregation interval in days (e.g. 30)
  evalscript:    string;
  outputId:      string;  // must match evalscript output id
  maxCloudCover?: number; // percent (default 20)
}

/**
 * Calls Sentinel Hub Statistical API and returns time-series statistics.
 * Retries once on 401 (token refresh).
 */
export async function sentinelHubStats(req: SHStatsRequest): Promise<SHStatsResponse> {
  return _doStats(req, true);
}

async function _doStats(req: SHStatsRequest, retry: boolean): Promise<SHStatsResponse> {
  const token = await getSentinelHubToken();

  const payload = {
    input: {
      bounds: { geometry: req.geometry },
      data: [{
        type:       req.dataType,
        dataFilter: {
          timeRange:   { from: req.fromDate, to: req.toDate },
          ...(req.dataType === 'sentinel-2-l2a'
            ? { maxCloudCoverage: req.maxCloudCover ?? 20 }
            : {})
        }
      }]
    },
    aggregation: {
      timeRange:           { from: req.fromDate, to: req.toDate },
      aggregationInterval: { of: `P${req.intervalDays}D` },
      evalscript:          req.evalscript,
      resx:                10,
      resy:                10
    },
    calculations: { [req.outputId]: {} }
  };

  const response = await fetch(STATS_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`
    },
    body:   JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  if (response.status === 401 && retry) {
    cachedToken   = null;
    tokenExpiresAt = 0;
    return _doStats(req, false);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sentinel Hub Statistical API failed: ${response.status} — ${text}`);
  }

  return response.json() as Promise<SHStatsResponse>;
}

/**
 * Returns true if a GeoJSON polygon's bounding box exceeds the Sentinel Hub
 * Statistical API resolution limit (~1500 m/px at resx=10).
 * Approximate limit: bbox > 0.5° on any axis (≈ 55 km) is too large.
 * For such polygons, use the centroid + pointToPolygon instead.
 */
export function geometryExceedsSentinelLimit(geometry: SHGeometry): boolean {
  let coords: number[][];
  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0];
  } else {
    // MultiPolygon — use first ring of first polygon
    coords = geometry.coordinates[0][0];
  }
  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const lonSpan = Math.max(...lons) - Math.min(...lons);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  return lonSpan > 0.5 || latSpan > 0.5; // > ~55 km on any side
}

/**
 * Creates a small square polygon around a point (for coordinate-based checks).
 * delta = 0.005° ≈ 550m at equator → ~0.3 km² area
 */
export function pointToPolygon(lat: number, lon: number, deltaDeg = 0.005): SHGeometry {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon - deltaDeg, lat - deltaDeg],
      [lon + deltaDeg, lat - deltaDeg],
      [lon + deltaDeg, lat + deltaDeg],
      [lon - deltaDeg, lat + deltaDeg],
      [lon - deltaDeg, lat - deltaDeg]
    ]]
  };
}

/**
 * Extracts mean values from a Statistical API response for a given output + band.
 * Returns array of { date, mean } sorted by date.
 */
export function extractMeanSeries(
  response: SHStatsResponse,
  outputId: string,
  bandId = 'B0'
): Array<{ date: string; mean: number }> {
  return (response.data ?? [])
    .filter(d => d.outputs?.[outputId]?.bands?.[bandId]?.stats?.mean != null)
    .map(d => ({
      date: d.interval.from.split('T')[0],
      mean: d.outputs[outputId].bands[bandId].stats.mean
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
