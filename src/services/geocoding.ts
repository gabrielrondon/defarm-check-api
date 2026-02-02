/**
 * Geocoding Service
 *
 * Converts addresses to coordinates using OpenStreetMap Nominatim API (free)
 * with optional Google Maps API fallback for better accuracy.
 *
 * Features:
 * - Redis caching (1 year TTL - addresses are stable)
 * - Rate limiting (1 req/sec for Nominatim)
 * - Brazil-specific optimizations
 * - Error handling and retries
 */

import { cacheService } from './cache.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GeocodingResult {
  coordinates: Coordinates;
  displayName: string;
  address: {
    city?: string;
    state?: string;
    country?: string;
  };
  source?: 'nominatim' | 'google' | 'cache';
}

export class GeocodingService {
  private lastRequestTime: number = 0;
  private readonly NOMINATIM_RATE_LIMIT_MS = 1000; // 1 request per second
  private readonly CACHE_TTL = 31536000; // 1 year (addresses don't change)
  private readonly REQUEST_TIMEOUT = 5000; // 5 seconds

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string): Promise<GeocodingResult> {
    // Normalize address
    const normalizedAddress = this.normalizeAddress(address);

    logger.debug({ address: normalizedAddress }, 'Geocoding address');

    // Try cache first
    const cached = await this.getFromCache(normalizedAddress);
    if (cached) {
      logger.debug({ address: normalizedAddress }, 'Geocoding cache hit');
      return { ...cached, source: 'cache' };
    }

    // Try Nominatim (free)
    try {
      const result = await this.geocodeWithNominatim(normalizedAddress);
      await this.saveToCache(normalizedAddress, result);
      return { ...result, source: 'nominatim' };
    } catch (err) {
      logger.warn(
        { address: normalizedAddress, error: (err as Error).message },
        'Nominatim geocoding failed'
      );

      // Try Google Maps fallback (if configured)
      if (config.geocoding?.googleApiKey) {
        try {
          const result = await this.geocodeWithGoogle(normalizedAddress);
          await this.saveToCache(normalizedAddress, result);
          return { ...result, source: 'google' };
        } catch (googleErr) {
          logger.error(
            { address: normalizedAddress, error: (googleErr as Error).message },
            'Google geocoding also failed'
          );
          throw googleErr;
        }
      }

      throw err;
    }
  }

  /**
   * Geocode using OpenStreetMap Nominatim (free, no API key)
   */
  private async geocodeWithNominatim(address: string): Promise<GeocodingResult> {
    // Rate limiting (1 req/sec)
    await this.enforceRateLimit();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br'); // Brazil only
    url.searchParams.set('addressdetails', '1');

    logger.debug({ url: url.toString() }, 'Calling Nominatim API');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'DeFarm-Check-API/1.0 (environmental-compliance-api)',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        throw new Error('Address not found');
      }

      const result = data[0];

      return {
        coordinates: {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon)
        },
        displayName: result.display_name,
        address: {
          city: result.address?.city || result.address?.town || result.address?.village,
          state: result.address?.state,
          country: result.address?.country
        }
      };
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        throw new Error('Geocoding request timeout');
      }
      throw err;
    }
  }

  /**
   * Geocode using Google Maps API (paid, requires API key)
   */
  private async geocodeWithGoogle(address: string): Promise<GeocodingResult> {
    const apiKey = config.geocoding?.googleApiKey;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('region', 'br'); // Brazil

    logger.debug({ url: url.toString().replace(apiKey, '***') }, 'Calling Google Maps API');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google Maps API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        throw new Error(`Google geocoding failed: ${data.status}`);
      }

      const result = data.results[0];
      const location = result.geometry.location;

      // Extract address components
      const addressComponents = result.address_components || [];
      const city = addressComponents.find((c: any) =>
        c.types.includes('locality') || c.types.includes('administrative_area_level_2')
      )?.long_name;
      const state = addressComponents.find((c: any) =>
        c.types.includes('administrative_area_level_1')
      )?.short_name;
      const country = addressComponents.find((c: any) =>
        c.types.includes('country')
      )?.long_name;

      return {
        coordinates: {
          lat: location.lat,
          lon: location.lng
        },
        displayName: result.formatted_address,
        address: {
          city,
          state,
          country
        }
      };
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        throw new Error('Geocoding request timeout');
      }
      throw err;
    }
  }

  /**
   * Normalize address for better geocoding results
   */
  private normalizeAddress(address: string): string {
    let normalized = address.trim();

    // Add "Brazil" if not present
    if (!normalized.toLowerCase().includes('brasil') &&
        !normalized.toLowerCase().includes('brazil')) {
      normalized += ', Brazil';
    }

    // Normalize state abbreviations (common in Brazil)
    const stateMap: Record<string, string> = {
      'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas',
      'BA': 'Bahia', 'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo',
      'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul',
      'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
      'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte',
      'RS': 'Rio Grande do Sul', 'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina',
      'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
    };

    // Replace state abbreviations with full names for better results
    Object.entries(stateMap).forEach(([abbr, fullName]) => {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, fullName);
      }
    });

    return normalized;
  }

  /**
   * Enforce Nominatim rate limit (1 request per second)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.NOMINATIM_RATE_LIMIT_MS) {
      const waitTime = this.NOMINATIM_RATE_LIMIT_MS - timeSinceLastRequest;
      logger.debug({ waitTime }, 'Rate limiting geocoding request');
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get geocoding result from cache
   */
  private async getFromCache(address: string): Promise<GeocodingResult | null> {
    try {
      const cached = await cacheService.get<GeocodingResult>('geocoding', address, 'address');
      return cached;
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to get from geocoding cache');
      return null;
    }
  }

  /**
   * Save geocoding result to cache
   */
  private async saveToCache(address: string, result: GeocodingResult): Promise<void> {
    try {
      await cacheService.set('geocoding', address, 'address', result, this.CACHE_TTL);
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to save to geocoding cache');
    }
  }
}

export const geocodingService = new GeocodingService();
