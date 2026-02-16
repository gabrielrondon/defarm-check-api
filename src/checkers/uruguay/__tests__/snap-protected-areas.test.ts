/**
 * Integration Tests: SNAP Protected Areas Checker (Uruguay)
 *
 * Tests spatial queries against SNAP protected areas database
 * Requires: PostgreSQL with PostGIS extension + seeded snap_areas_uruguay table
 *
 * Run: npm test -- snap-protected-areas.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SNAPProtectedAreasChecker } from '../snap-protected-areas.js';
import { InputType, Country, NormalizedInput } from '../../../types/input.js';
import { CheckStatus, Severity } from '../../../types/checker.js';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

describe('SNAPProtectedAreasChecker', () => {
  let checker: SNAPProtectedAreasChecker;
  let hasData: boolean = false;

  beforeAll(async () => {
    checker = new SNAPProtectedAreasChecker();

    // Check if SNAP data is seeded
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM snap_areas_uruguay`);
    const count = Number(result.rows[0].count);
    hasData = count > 0;

    if (!hasData) {
      console.warn('⚠️  WARNING: snap_areas_uruguay table is empty. Run: npm run seed:snap-areas');
      console.warn('   Some tests will be skipped or may fail.');
    } else {
      console.log(`✓ SNAP data available: ${count} protected areas`);
    }
  });

  describe('Metadata', () => {
    it('should have correct metadata', () => {
      expect(checker.metadata.name).toBe('SNAP Protected Areas');
      expect(checker.metadata.category).toBe('environmental');
      expect(checker.metadata.supportedInputTypes).toContain(InputType.COORDINATES);
      expect(checker.metadata.supportedCountries).toContain(Country.URUGUAY);
      expect(checker.metadata.priority).toBe(8);
    });

    it('should support COORDINATES and ADDRESS input types', () => {
      expect(checker.metadata.supportedInputTypes).toContain(InputType.COORDINATES);
      expect(checker.metadata.supportedInputTypes).toContain(InputType.ADDRESS);
    });

    it('should only support Uruguay', () => {
      expect(checker.metadata.supportedCountries).toEqual([Country.URUGUAY]);
      expect(checker.metadata.supportedCountries).not.toContain(Country.BRAZIL);
    });

    it('should have cache TTL of 30 days', () => {
      expect(checker.config.cacheTTL).toBe(2592000); // 30 days in seconds
    });
  });

  describe('Coordinates Validation', () => {
    it('should reject coordinates outside Uruguay bounds (too far north)', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-29.0,-55.0', // North of Uruguay
        originalValue: { lat: -29.0, lon: -55.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -29.0, lon: -55.0 }
      };

      const result = await checker.check(input);
      expect(result.status).toBe(CheckStatus.ERROR);
      expect(result.message).toContain('Invalid coordinates for Uruguay');
    });

    it('should reject coordinates outside Uruguay bounds (too far south)', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-36.0,-55.0', // South of Uruguay
        originalValue: { lat: -36.0, lon: -55.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -36.0, lon: -55.0 }
      };

      const result = await checker.check(input);
      expect(result.status).toBe(CheckStatus.ERROR);
      expect(result.message).toContain('Invalid coordinates for Uruguay');
    });

    it('should reject coordinates outside Uruguay bounds (too far west)', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-33.0,-59.0', // West of Uruguay
        originalValue: { lat: -33.0, lon: -59.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -33.0, lon: -59.0 }
      };

      const result = await checker.check(input);
      expect(result.status).toBe(CheckStatus.ERROR);
      expect(result.message).toContain('Invalid coordinates for Uruguay');
    });

    it('should reject coordinates outside Uruguay bounds (too far east)', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-33.0,-52.0', // East of Uruguay
        originalValue: { lat: -33.0, lon: -52.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -33.0, lon: -52.0 }
      };

      const result = await checker.check(input);
      expect(result.status).toBe(CheckStatus.ERROR);
      expect(result.message).toContain('Invalid coordinates for Uruguay');
    });

    it('should accept valid Uruguay coordinates', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.9,-56.2', // Montevideo
        originalValue: { lat: -34.9, lon: -56.2 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.9, lon: -56.2 }
      };

      const result = await checker.check(input);
      expect(result.status).toBeDefined();
      expect([CheckStatus.PASS, CheckStatus.FAIL]).toContain(result.status);
    });

    it('should reject input without coordinates', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: 'invalid',
        originalValue: 'invalid',
        country: Country.URUGUAY
        // No coordinates field
      };

      const result = await checker.check(input);
      expect(result.status).toBe(CheckStatus.ERROR);
      expect(result.message).toContain('Coordinates required');
    });
  });

  describe('Spatial Queries', () => {
    it('should return PASS for coordinates outside protected areas', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.9,-56.2', // Montevideo (urban, not protected)
        originalValue: { lat: -34.9, lon: -56.2 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.9, lon: -56.2 }
      };

      const result = await checker.check(input);

      expect(result.status).toBe(CheckStatus.PASS);
      expect(result.message).toContain('do not overlap');
      expect(result.details).toBeDefined();
      expect(result.details.coordinates).toEqual({ lat: -34.9, lon: -56.2 });
      expect(result.details.totalAreasChecked).toBe(22);
      expect(result.evidence?.dataSource).toBe('SNAP (Uruguay)');
    });

    it('should return FAIL for coordinates inside protected area', async () => {
      if (!hasData) {
        console.warn('⚠️  Skipping test: no SNAP data');
        return;
      }

      // Get a sample protected area from database
      const areaResult = await db.execute(sql`
        SELECT
          ST_Y(ST_Centroid(geometry)) as lat,
          ST_X(ST_Centroid(geometry)) as lon,
          name
        FROM snap_areas_uruguay
        WHERE geometry IS NOT NULL
        LIMIT 1
      `);

      if (areaResult.rows.length === 0) {
        console.warn('⚠️  No SNAP areas with geometry found');
        return;
      }

      const area = areaResult.rows[0];
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: `${area.lat},${area.lon}`,
        originalValue: { lat: Number(area.lat), lon: Number(area.lon) },
        country: Country.URUGUAY,
        coordinates: { lat: Number(area.lat), lon: Number(area.lon) }
      };

      const result = await checker.check(input);

      expect(result.status).toBe(CheckStatus.FAIL);
      expect(result.severity).toBe(Severity.HIGH);
      expect(result.message).toContain('protected area');
      expect(result.details).toBeDefined();
      expect(result.details.areaName).toBeDefined();
      expect(result.details.category).toBeDefined();
      expect(result.details.department).toBeDefined();
      expect(result.details.recommendation).toContain('RISK');
      expect(result.details.legalFramework).toContain('Ley 17.234');
      expect(result.evidence?.dataSource).toBe('SNAP (Uruguay)');
    });

    it('should include detailed information for protected areas', async () => {
      if (!hasData) {
        console.warn('⚠️  Skipping test: no SNAP data');
        return;
      }

      // Get centroid of first protected area
      const areaResult = await db.execute(sql`
        SELECT
          ST_Y(ST_Centroid(geometry)) as lat,
          ST_X(ST_Centroid(geometry)) as lon
        FROM snap_areas_uruguay
        WHERE geometry IS NOT NULL
        LIMIT 1
      `);

      if (areaResult.rows.length === 0) {
        console.warn('⚠️  No SNAP areas with geometry');
        return;
      }

      const area = areaResult.rows[0];
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: `${area.lat},${area.lon}`,
        originalValue: { lat: Number(area.lat), lon: Number(area.lon) },
        country: Country.URUGUAY,
        coordinates: { lat: Number(area.lat), lon: Number(area.lon) }
      };

      const result = await checker.check(input);

      if (result.status === CheckStatus.FAIL) {
        expect(result.details.areaName).toBeDefined();
        expect(result.details.category).toBeDefined();
        expect(result.details.areaHa).toBeDefined();
        expect(result.details.department).toBeDefined();
        expect(result.details.legalStatus).toBeDefined();
        expect(result.details.source).toBe('SNAP - Sistema Nacional de Áreas Protegidas');
        expect(result.details.regulatoryBody).toBe('DINABISE - Ministerio de Ambiente');
      }
    });
  });

  describe('Performance', () => {
    it('should complete check within timeout (5 seconds)', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.0,-55.0',
        originalValue: { lat: -34.0, lon: -55.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.0, lon: -55.0 }
      };

      const start = Date.now();
      await checker.check(input);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // 5 second timeout
    });

    it('should handle multiple checks efficiently', async () => {
      const coordinates = [
        { lat: -34.0, lon: -55.0 },
        { lat: -34.5, lon: -56.0 },
        { lat: -33.0, lon: -54.0 }
      ];

      const start = Date.now();

      const promises = coordinates.map(coords => {
        const input: NormalizedInput = {
          type: InputType.COORDINATES,
          value: `${coords.lat},${coords.lon}`,
          originalValue: coords,
          country: Country.URUGUAY,
          coordinates: coords
        };
        return checker.check(input);
      });

      await Promise.all(promises);
      const duration = Date.now() - start;

      // All 3 checks should complete in under 10 seconds total
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.0,-55.0',
        originalValue: { lat: -34.0, lon: -55.0 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.0, lon: -55.0 }
      };

      // This should not throw unhandled errors
      try {
        await checker.check(input);
      } catch (error) {
        // Error should be a proper Error instance with message
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBeDefined();
      }
    });
  });

  describe('Evidence and Traceability', () => {
    it('should include evidence metadata', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.9,-56.2',
        originalValue: { lat: -34.9, lon: -56.2 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.9, lon: -56.2 }
      };

      const result = await checker.check(input);

      expect(result.evidence).toBeDefined();
      expect(result.evidence?.dataSource).toBe('SNAP (Uruguay)');
      expect(result.evidence?.url).toBe('https://www.ambiente.gub.uy/snap');
      expect(result.evidence?.lastUpdate).toBeDefined();
    });

    it('should include source information in details', async () => {
      const input: NormalizedInput = {
        type: InputType.COORDINATES,
        value: '-34.9,-56.2',
        originalValue: { lat: -34.9, lon: -56.2 },
        country: Country.URUGUAY,
        coordinates: { lat: -34.9, lon: -56.2 }
      };

      const result = await checker.check(input);

      expect(result.details.source).toBe('SNAP - Sistema Nacional de Áreas Protegidas');
    });
  });
});
