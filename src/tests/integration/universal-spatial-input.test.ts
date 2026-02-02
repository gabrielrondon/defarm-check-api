/**
 * Integration Tests - Universal Spatial Input
 *
 * Tests all 3 input methods for spatial checkers:
 * 1. ADDRESS - Geocoding to coordinates
 * 2. COORDINATES - Direct spatial queries
 * 3. CAR - Extract coordinates from CAR and run spatial checks
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from '../../api/server.js';
import type { FastifyInstance } from 'fastify';

describe('Universal Spatial Input - Integration Tests', () => {
  let app: FastifyInstance;
  let apiKey: string;

  beforeAll(async () => {
    // Build Fastify app
    app = await build();
    await app.ready();

    // Use test API key from environment or default
    apiKey = process.env.TEST_API_KEY || 'test-key-12345';
  });

  describe('ADDRESS Input Type', () => {
    it('should geocode address and run all spatial checkers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'Altamira, Pará'
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Verify response structure
      expect(data).toHaveProperty('checkId');
      expect(data).toHaveProperty('verdict');
      expect(data).toHaveProperty('score');
      expect(data).toHaveProperty('sources');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('metadata');

      // Verify input was geocoded
      expect(data.input.type).toBe('COORDINATES'); // Normalized to COORDINATES
      expect(data.input).toHaveProperty('coordinates');
      expect(data.input.metadata).toHaveProperty('originalType');
      expect(data.input.metadata.originalType).toBe('ADDRESS');
      expect(data.input.metadata).toHaveProperty('geocodingResult');

      // Verify spatial checkers ran
      const spatialCheckers = [
        'CAR - Cadastro Ambiental Rural',
        'CAR x PRODES Intersection',
        'PRODES Deforestation',
        'DETER Real-Time Alerts',
        'MapBiomas Validated Deforestation',
        'IBAMA Embargoes',
        'Indigenous Lands',
        'Conservation Units',
        'INPE Fire Hotspots',
        'ANA Water Use Permits'
      ];

      const checkerNames = data.sources.map((s: any) => s.name);

      // At least some spatial checkers should have run
      const spatialCheckersRan = spatialCheckers.filter(name =>
        checkerNames.includes(name)
      );
      expect(spatialCheckersRan.length).toBeGreaterThan(0);
    });

    it('should cache geocoding results', async () => {
      const address = 'São Paulo, SP';

      // First request - should geocode
      const response1 = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: { type: 'ADDRESS', value: address }
        }
      });

      expect(response1.statusCode).toBe(200);
      const data1 = JSON.parse(response1.body);
      const geocodingResult1 = data1.input.metadata.geocodingResult;

      // Second request - should use cache
      const response2 = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: { type: 'ADDRESS', value: address }
        }
      });

      expect(response2.statusCode).toBe(200);
      const data2 = JSON.parse(response2.body);
      const geocodingResult2 = data2.input.metadata.geocodingResult;

      // Coordinates should match (from cache)
      expect(geocodingResult2.coordinates.lat).toBe(geocodingResult1.coordinates.lat);
      expect(geocodingResult2.coordinates.lon).toBe(geocodingResult1.coordinates.lon);
      expect(geocodingResult2.source).toBe('cache');
    });

    it('should handle invalid addresses gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'InvalidAddressXYZ123456789'
          }
        }
      });

      // Should return error for invalid address
      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Failed to geocode address');
    });

    it('should normalize Brazilian state abbreviations', async () => {
      // Test with state abbreviation
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'Belém, PA'
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Should have expanded PA → Pará and geocoded successfully
      expect(data.input.metadata.geocodingResult).toBeDefined();
      expect(data.input.coordinates).toBeDefined();
    });
  });

  describe('COORDINATES Input Type', () => {
    it('should run all spatial checkers with coordinates', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: {
              lat: -3.204065,
              lon: -52.209961
            }
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Verify coordinates input
      expect(data.input.type).toBe('COORDINATES');
      expect(data.input.coordinates.lat).toBe(-3.204065);
      expect(data.input.coordinates.lon).toBe(-52.209961);

      // Should run multiple spatial checkers
      expect(data.sources.length).toBeGreaterThan(0);
    });

    it('should validate coordinates are within Brazil', async () => {
      // Invalid coordinates (outside Brazil)
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: {
              lat: 40.7128,  // New York
              lon: -74.0060
            }
          }
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.message).toContain('Coordenadas inválidas');
    });

    it('should handle coordinates at CAR boundaries', async () => {
      // Coordinates that may fall within CAR property
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: {
              lat: -12.9714,  // Coordinates in Mato Grosso
              lon: -51.7956
            }
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // CAR checker should have run
      const carChecker = data.sources.find((s: any) =>
        s.name.includes('CAR') && !s.name.includes('PRODES')
      );
      expect(carChecker).toBeDefined();
    });
  });

  describe('CAR Input Type with Spatial Checkers', () => {
    it('should extract CAR coordinates and run spatial checks', async () => {
      // Use a real CAR number from database (if available)
      // This test assumes we have CAR data seeded
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'CAR',
            value: 'BA-2909703-F05433B5497742CB8FB37AE31C2C4463'
          }
        }
      });

      // May succeed or fail depending on whether CAR exists in DB
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);

        // CAR checker should have run
        const carChecker = data.sources.find((s: any) =>
          s.name === 'CAR - Cadastro Ambiental Rural'
        );
        expect(carChecker).toBeDefined();

        // CAR x PRODES should have run
        const carProdesChecker = data.sources.find((s: any) =>
          s.name === 'CAR x PRODES Intersection'
        );
        expect(carProdesChecker).toBeDefined();
      }
    });

    it('should handle non-existent CAR number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'CAR',
            value: 'XX-0000000-NONEXISTENT000000000000000000000000'
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // CAR checker should return ERROR or NOT_APPLICABLE
      const carChecker = data.sources.find((s: any) =>
        s.name === 'CAR - Cadastro Ambiental Rural'
      );

      if (carChecker) {
        expect(['ERROR', 'NOT_APPLICABLE']).toContain(carChecker.status);
      }
    });
  });

  describe('Checker Consistency', () => {
    it('should return same results for ADDRESS vs COORDINATES at same location', async () => {
      // Get results for address
      const addressResponse = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'Manaus, Amazonas'
          }
        }
      });

      expect(addressResponse.statusCode).toBe(200);
      const addressData = JSON.parse(addressResponse.body);
      const geocodedCoords = addressData.input.coordinates;

      // Get results for same coordinates
      const coordsResponse = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: geocodedCoords
          }
        }
      });

      expect(coordsResponse.statusCode).toBe(200);
      const coordsData = JSON.parse(coordsResponse.body);

      // Both should run same checkers
      const addressCheckerNames = addressData.sources.map((s: any) => s.name).sort();
      const coordsCheckerNames = coordsData.sources.map((s: any) => s.name).sort();

      expect(addressCheckerNames).toEqual(coordsCheckerNames);
    });
  });

  describe('Performance', () => {
    it('should complete ADDRESS check within reasonable time', async () => {
      const startTime = Date.now();

      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'Brasília, DF'
          }
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.statusCode).toBe(200);

      // First request (with geocoding) should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should complete COORDINATES check within reasonable time', async () => {
      const startTime = Date.now();

      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: {
              lat: -15.7801,
              lon: -47.9292
            }
          }
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.statusCode).toBe(200);

      // Coordinates check should be fast (<2 seconds)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json'
          // No X-API-Key header
        },
        payload: {
          input: {
            type: 'ADDRESS',
            value: 'São Paulo, SP'
          }
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle invalid input type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'INVALID_TYPE',
            value: 'test'
          }
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle malformed coordinates', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        payload: {
          input: {
            type: 'COORDINATES',
            value: {
              lat: 'invalid',
              lon: 'invalid'
            }
          }
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
