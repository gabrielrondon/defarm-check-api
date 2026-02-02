#!/usr/bin/env tsx
/**
 * CAR x PRODES Intersection Checker
 *
 * Verifies if a CAR-registered property has PRODES deforestation within its boundaries
 * using PostGIS spatial intersection queries.
 *
 * Data sources:
 * - CAR (SICAR): Rural environmental registry with property boundaries
 * - PRODES (INPE): Annual deforestation monitoring (2015-2024)
 *
 * Query pattern: ST_Intersects + ST_Intersection for precise area calculation
 * Update frequency: Monthly (PRODES data)
 */

import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  CheckStatus,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

interface ProdesIntersection extends Record<string, unknown> {
  year: number;
  area_ha: number;
  intersection_ha: number;
  state: string;
  municipality: string;
  path_row: string;
}

interface CarProperty extends Record<string, unknown> {
  car_number: string;
  status: string;
  area_ha: number;
  state: string;
  municipality: string;
}

export class CarProdesIntersectionChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'CAR x PRODES Intersection',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica desmatamento PRODES em propriedades CAR através de intersecção espacial',
    priority: 10,
    supportedInputTypes: [InputType.CAR, InputType.COORDINATES, InputType.ADDRESS]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 1209600, // 14 days (PRODES updates monthly, balance freshness vs performance)
    timeout: 15000 // 15 seconds (complex spatial queries on large properties)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking CAR x PRODES intersection');

    try {
      // Route to appropriate check method based on input type
      if (input.type === InputType.COORDINATES) {
        return await this.checkByCoordinates(input);
      } else if (input.type === InputType.CAR) {
        return await this.checkByCarNumber(input);
      }

      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Input type not supported for CAR x PRODES check',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(
        `Failed to check CAR x PRODES intersection: ${(err as Error).message}`
      );
    }
  }

  /**
   * Check by CAR number
   */
  private async checkByCarNumber(input: NormalizedInput): Promise<CheckerResult> {
    const carNumber = input.value;
    if (!carNumber) {
      throw new Error('CAR number required');
    }

    try {
      // Step 1: Get CAR property info and geometry
      const carResult = await db.execute<CarProperty>(sql`
        SELECT
          car_number,
          status,
          area_ha,
          state,
          municipality
        FROM car_registrations
        WHERE car_number = ${carNumber}
        LIMIT 1
      `);

      if (carResult.rows.length === 0) {
        return {
          status: CheckStatus.ERROR,
          message: `CAR property not found: ${carNumber}`,
          details: {
            car_number: carNumber,
            error: 'Property not found in CAR database'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      const carProperty = carResult.rows[0];

      // Step 2: Query PRODES intersections
      // Uses ST_Intersects (indexed) + ST_Intersection for precise area
      // Filters to 2015+ (10 years of data)
      // LIMIT 50 prevents timeout on very large properties
      const currentYear = new Date().getFullYear();
      const prodesResult = await db.execute<ProdesIntersection>(sql`
        SELECT
          p.year,
          p.area_ha,
          ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) AS intersection_ha,
          p.state,
          p.municipality,
          p.path_row
        FROM car_registrations c
        CROSS JOIN prodes_deforestation p
        WHERE c.car_number = ${carNumber}
          AND p.year >= 2015
          AND ST_Intersects(c.geometry, p.geometry)
        ORDER BY p.year DESC, intersection_ha DESC
        LIMIT 50
      `);

      const intersections = prodesResult.rows || [];

      // No deforestation found
      if (intersections.length === 0) {
        return {
          status: CheckStatus.PASS,
          message: 'No PRODES deforestation detected in CAR property (2015-2024)',
          details: {
            car_number: carNumber,
            car_status: carProperty.status,
            car_area_ha: carProperty.area_ha,
            municipality: carProperty.municipality,
            state: carProperty.state,
            checked_years: '2015-2024',
            deforestation_found: false
          },
          evidence: {
            dataSource: 'INPE PRODES + SICAR CAR',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Analyze intersections
      const totalPolygons = intersections.length;
      const totalDeforestedHa = intersections.reduce(
        (sum, i) => sum + Number(i.intersection_ha),
        0
      );
      const newestYear = intersections[0].year;
      const oldestYear = intersections[intersections.length - 1].year;

      // Group by year
      const deforestationByYear = intersections.reduce((acc, i) => {
        const year = i.year.toString();
        acc[year] = (acc[year] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Recent deforestation (last 5 years)
      const recentYears = currentYear - 5;
      const recentDeforestation = intersections.filter(i => i.year >= recentYears);
      const recentDeforestedHa = recentDeforestation.reduce(
        (sum, i) => sum + Number(i.intersection_ha),
        0
      );

      // Calculate severity
      const severity = this.calculateSeverity(
        newestYear,
        currentYear,
        totalDeforestedHa,
        totalPolygons
      );

      // Build message
      let message = `Deforestation detected: ${Math.round(totalDeforestedHa)}ha in ${totalPolygons} polygon(s)`;
      if (newestYear >= currentYear - 2) {
        message += ` (recent: ${newestYear})`;
      } else {
        message += ` (${oldestYear}-${newestYear})`;
      }

      return {
        status: CheckStatus.FAIL,
        severity,
        message,
        details: {
          car_number: carNumber,
          car_status: carProperty.status,
          car_area_ha: carProperty.area_ha,
          car_municipality: carProperty.municipality,
          car_state: carProperty.state,
          summary: {
            total_polygons: totalPolygons,
            total_deforested_ha: Math.round(totalDeforestedHa),
            deforested_percentage: Math.round(
              (totalDeforestedHa / carProperty.area_ha) * 100
            ),
            newest_year: newestYear,
            oldest_year: oldestYear,
            recent_deforestation_ha: Math.round(recentDeforestedHa),
            recent_deforestation_count: recentDeforestation.length
          },
          deforestation_by_year: deforestationByYear,
          top_polygons: intersections.slice(0, 10).map(i => ({
            year: i.year,
            intersection_ha: Number(i.intersection_ha),
            municipality: i.municipality,
            state: i.state,
            path_row: i.path_row
          })),
          recommendation: this.getRecommendation(severity, totalDeforestedHa, newestYear)
        },
        evidence: {
          dataSource: 'INPE PRODES + SICAR CAR (spatial intersection)',
          url: 'http://terrabrasilis.dpi.inpe.br/',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(
        `Failed to check CAR x PRODES intersection by CAR number: ${(err as Error).message}`
      );
    }
  }

  /**
   * Check by coordinates - finds CAR at point, then checks PRODES
   */
  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) {
      return {
        status: CheckStatus.ERROR,
        message: 'Coordinates not provided',
        executionTimeMs: 0,
        cached: false
      };
    }

    const { lat, lon } = input.coordinates;

    try {
      // Step 1: Find CAR property at this location
      const carResult = await db.execute<CarProperty>(sql`
        SELECT
          car_number,
          status,
          area_ha,
          state,
          municipality
        FROM car_registrations
        WHERE ST_Contains(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1
      `);

      // No CAR property at this location
      if (carResult.rows.length === 0) {
        return {
          status: CheckStatus.PASS,
          message: 'No CAR property found at this location',
          details: {
            coordinates: { lat, lon },
            checked_location: true,
            car_found: false
          },
          evidence: {
            dataSource: 'SICAR CAR',
            url: 'https://consultapublica.car.gov.br/',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      const carProperty = carResult.rows[0];
      const carNumber = carProperty.car_number;

      // Step 2: Query PRODES intersections for this CAR property
      const currentYear = new Date().getFullYear();
      const prodesResult = await db.execute<ProdesIntersection>(sql`
        SELECT
          p.year,
          p.area_ha,
          ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) AS intersection_ha,
          p.state,
          p.municipality,
          p.path_row
        FROM car_registrations c
        CROSS JOIN prodes_deforestation p
        WHERE c.car_number = ${carNumber}
          AND p.year >= 2015
          AND ST_Intersects(c.geometry, p.geometry)
        ORDER BY p.year DESC, intersection_ha DESC
        LIMIT 50
      `);

      const intersections = prodesResult.rows || [];

      // No deforestation found
      if (intersections.length === 0) {
        return {
          status: CheckStatus.PASS,
          message: 'CAR property found - No PRODES deforestation detected (2015-2024)',
          details: {
            coordinates: { lat, lon },
            car_number: carNumber,
            car_status: carProperty.status,
            car_area_ha: carProperty.area_ha,
            municipality: carProperty.municipality,
            state: carProperty.state,
            checked_years: '2015-2024',
            deforestation_found: false
          },
          evidence: {
            dataSource: 'INPE PRODES + SICAR CAR',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Analyze intersections (same logic as checkByCarNumber)
      const totalPolygons = intersections.length;
      const totalDeforestedHa = intersections.reduce(
        (sum, i) => sum + Number(i.intersection_ha),
        0
      );
      const newestYear = intersections[0].year;
      const oldestYear = intersections[intersections.length - 1].year;

      const deforestationByYear = intersections.reduce((acc, i) => {
        const year = i.year.toString();
        acc[year] = (acc[year] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const recentYears = currentYear - 5;
      const recentDeforestation = intersections.filter(i => i.year >= recentYears);
      const recentDeforestedHa = recentDeforestation.reduce(
        (sum, i) => sum + Number(i.intersection_ha),
        0
      );

      const severity = this.calculateSeverity(
        newestYear,
        currentYear,
        totalDeforestedHa,
        totalPolygons
      );

      let message = `CAR property found - Deforestation: ${Math.round(totalDeforestedHa)}ha in ${totalPolygons} polygon(s)`;
      if (newestYear >= currentYear - 2) {
        message += ` (recent: ${newestYear})`;
      } else {
        message += ` (${oldestYear}-${newestYear})`;
      }

      return {
        status: CheckStatus.FAIL,
        severity,
        message,
        details: {
          coordinates: { lat, lon },
          car_number: carNumber,
          car_status: carProperty.status,
          car_area_ha: carProperty.area_ha,
          car_municipality: carProperty.municipality,
          car_state: carProperty.state,
          summary: {
            total_polygons: totalPolygons,
            total_deforested_ha: Math.round(totalDeforestedHa),
            deforested_percentage: Math.round(
              (totalDeforestedHa / carProperty.area_ha) * 100
            ),
            newest_year: newestYear,
            oldest_year: oldestYear,
            recent_deforestation_ha: Math.round(recentDeforestedHa),
            recent_deforestation_count: recentDeforestation.length
          },
          deforestation_by_year: deforestationByYear,
          top_polygons: intersections.slice(0, 10).map(i => ({
            year: i.year,
            intersection_ha: Number(i.intersection_ha),
            municipality: i.municipality,
            state: i.state,
            path_row: i.path_row
          })),
          recommendation: this.getRecommendation(severity, totalDeforestedHa, newestYear)
        },
        evidence: {
          dataSource: 'INPE PRODES + SICAR CAR (spatial intersection)',
          url: 'http://terrabrasilis.dpi.inpe.br/',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(
        `Failed to check CAR x PRODES intersection by coordinates: ${(err as Error).message}`
      );
    }
  }

  /**
   * Calculate severity based on recency, area, and polygon count
   */
  private calculateSeverity(
    newestYear: number,
    currentYear: number,
    totalAreaHa: number,
    totalPolygons: number
  ): Severity {
    // CRITICAL: Very recent (last 2 years) OR large area (>= 100ha)
    if (newestYear >= currentYear - 2 || totalAreaHa >= 100) {
      return Severity.CRITICAL;
    }

    // HIGH: Recent (last 5 years) OR medium area (>= 25ha) OR many polygons (>= 5)
    if (newestYear >= currentYear - 5 || totalAreaHa >= 25 || totalPolygons >= 5) {
      return Severity.HIGH;
    }

    // MEDIUM: Older deforestation and small area
    return Severity.MEDIUM;
  }

  /**
   * Get recommendation text based on severity
   */
  private getRecommendation(
    severity: Severity,
    totalAreaHa: number,
    newestYear: number
  ): string {
    switch (severity) {
      case Severity.CRITICAL:
        return `CRITICAL: Recent deforestation detected (${newestYear}) or large area (${Math.round(totalAreaHa)}ha). Immediate environmental compliance review required. May require recovery plan and legal assessment.`;

      case Severity.HIGH:
        return `HIGH: Significant deforestation detected (${Math.round(totalAreaHa)}ha). Environmental compliance verification recommended. Review CAR status and potential environmental liabilities.`;

      case Severity.MEDIUM:
        return `MEDIUM: Historical deforestation detected. Verify if recovery measures were implemented and CAR status is compliant. Monitor for recurring patterns.`;

      default:
        return 'Environmental compliance review recommended.';
    }
  }
}

export default new CarProdesIntersectionChecker();
