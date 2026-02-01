#!/usr/bin/env tsx
/**
 * MapBiomas Alerta - Validated Deforestation Checker
 *
 * Verifica desmatamento validado por analistas humanos do MapBiomas.
 * Mais confiável que alertas automáticos (DETER), pois passa por validação visual.
 *
 * Data source: MapBiomas Alerta
 * Update frequency: Weekly
 * Validation: 30-90 days after detection
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
import { mapbiomasAlerta } from '../../db/schema.js';
import { sql, eq, and, gte } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

export class MapBiomasAlertaChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'MapBiomas Validated Deforestation',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica desmatamento validado por analistas (MapBiomas Alerta)',
    priority: 9, // Higher priority than DETER (validated data)
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24 hours (data updated weekly)
    timeout: 10000 // 10 seconds (complex spatial queries)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking MapBiomas validated deforestation');

    try {
      if (input.type === InputType.COORDINATES) {
        return await this.checkByCoordinates(input);
      } else if (input.type === InputType.CAR) {
        return await this.checkByCAR(input);
      }

      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Input type not supported for MapBiomas Alerta check',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check MapBiomas alerts: ${(err as Error).message}`);
    }
  }

  /**
   * Check by coordinates (property location)
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
    const buffer = 1000; // 1km radius

    // Query validated deforestation alerts near coordinates
    const result = await db.execute(sql`
      SELECT
        id,
        alert_code,
        area_ha,
        detected_at,
        published_at,
        state,
        municipality,
        biome,
        deforestation_class,
        deforestation_speed,
        source,
        indigenous_land,
        conservation_unit,
        embargoed_area,
        authorized_area,
        car_codes,
        ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
        ) as distance_meters
      FROM mapbiomas_alerta
      WHERE ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        ${buffer}
      )
      AND published_at >= CURRENT_DATE - INTERVAL '2 years'
      ORDER BY published_at DESC
      LIMIT 50
    `);

    const alerts = result.rows || [];

    if (alerts.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: `No validated deforestation found within ${buffer}m (last 2 years)`,
        details: {
          checked_area_meters: buffer,
          checked_period_years: 2,
          source: 'MapBiomas Alerta'
        },
        evidence: {
          dataSource: 'MapBiomas Alerta - Validated Deforestation',
          url: 'https://alerta.mapbiomas.org/',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    // Analyze alerts
    const totalAlerts = alerts.length;
    const totalAreaHa = alerts.reduce((sum: number, a: any) => sum + Number(a.area_ha), 0);
    const mostRecent = alerts[0] as any;

    // Count last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentAlerts = alerts.filter((a: any) => {
      const pubDate = new Date(a.published_at);
      return pubDate >= sixMonthsAgo;
    });

    // Check critical conditions
    const hasCriticalArea = alerts.some((a: any) => Number(a.area_ha) >= 25); // >= 25ha is critical
    const hasEmbargoedArea = alerts.some((a: any) => a.embargoed_area);
    const hasProtectedArea = alerts.some((a: any) => a.indigenous_land || a.conservation_unit);

    // Determine severity
    let severity = Severity.MEDIUM;
    if (hasProtectedArea || hasEmbargoedArea || hasCriticalArea) {
      severity = Severity.CRITICAL;
    } else if (recentAlerts.length > 0) {
      severity = Severity.HIGH;
    }

    let message = `${totalAlerts} validated deforestation alert(s) found`;
    if (recentAlerts.length > 0) {
      message += `, ${recentAlerts.length} in last 6 months`;
    }

    return {
      status: CheckStatus.FAIL,
      severity,
      message,
      details: {
        total_alerts: totalAlerts,
        total_area_ha: Math.round(totalAreaHa),
        recent_6_months: recentAlerts.length,
        checked_area_meters: buffer,
        most_recent: {
          alert_code: mostRecent.alert_code,
          date: mostRecent.published_at,
          area_ha: Number(mostRecent.area_ha),
          distance_meters: Math.round(Number(mostRecent.distance_meters)),
          biome: mostRecent.biome,
          municipality: mostRecent.municipality,
          state: mostRecent.state,
          deforestation_class: mostRecent.deforestation_class,
          embargoed_area: mostRecent.embargoed_area,
          indigenous_land: mostRecent.indigenous_land,
          conservation_unit: mostRecent.conservation_unit
        },
        critical_flags: {
          has_critical_area: hasCriticalArea,
          has_embargoed_area: hasEmbargoedArea,
          has_protected_area: hasProtectedArea
        },
        alerts: alerts.slice(0, 10).map((a: any) => ({
          alert_code: a.alert_code,
          published_at: a.published_at,
          area_ha: Number(a.area_ha),
          distance_meters: Math.round(Number(a.distance_meters)),
          deforestation_class: a.deforestation_class
        }))
      },
      evidence: {
        dataSource: 'MapBiomas Alerta - Validated Deforestation',
        url: `https://plataforma.alerta.mapbiomas.org/`,
        lastUpdate: mostRecent.published_at,
        raw: mostRecent
      },
      executionTimeMs: 0,
      cached: false
    };
  }

  /**
   * Check by CAR code (property registry)
   */
  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;

    // Query alerts that intersect with this CAR
    const result = await db.execute(sql`
      SELECT
        id,
        alert_code,
        area_ha,
        detected_at,
        published_at,
        state,
        municipality,
        biome,
        deforestation_class,
        deforestation_speed,
        source,
        indigenous_land,
        conservation_unit,
        embargoed_area,
        authorized_area,
        car_codes
      FROM mapbiomas_alerta
      WHERE car_codes @> ${JSON.stringify([carCode])}::jsonb
      AND published_at >= CURRENT_DATE - INTERVAL '2 years'
      ORDER BY published_at DESC
      LIMIT 50
    `);

    const alerts = result.rows || [];

    if (alerts.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: 'No validated deforestation found for this CAR property (last 2 years)',
        details: {
          car_code: carCode,
          checked_period_years: 2,
          source: 'MapBiomas Alerta'
        },
        evidence: {
          dataSource: 'MapBiomas Alerta - Validated Deforestation',
          url: 'https://alerta.mapbiomas.org/'
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    // Same analysis as coordinates
    const totalAlerts = alerts.length;
    const totalAreaHa = alerts.reduce((sum: number, a: any) => sum + Number(a.area_ha), 0);
    const mostRecent = alerts[0] as any;

    return {
      status: CheckStatus.FAIL,
      severity: totalAreaHa >= 25 ? Severity.CRITICAL : Severity.HIGH,
      message: `${totalAlerts} validated deforestation alert(s) in CAR property`,
      details: {
        car_code: carCode,
        total_alerts: totalAlerts,
        total_area_ha: Math.round(totalAreaHa),
        most_recent: {
          alert_code: mostRecent.alert_code,
          published_at: mostRecent.published_at,
          area_ha: Number(mostRecent.area_ha)
        },
        alerts: alerts.map((a: any) => ({
          alert_code: a.alert_code,
          published_at: a.published_at,
          area_ha: Number(a.area_ha),
          deforestation_class: a.deforestation_class
        }))
      },
      evidence: {
        dataSource: 'MapBiomas Alerta - Validated Deforestation',
        url: `https://plataforma.alerta.mapbiomas.org/`,
        raw: mostRecent
      },
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new MapBiomasAlertaChecker();
