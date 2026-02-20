/**
 * MapBiomas Territory & Deforestation Intelligence Checker
 *
 * Consulta o MapBiomas Alerta API (GraphQL) para obter:
 *   - Informações territoriais no ponto/propriedade (bioma, terras indígenas, UCs)
 *   - Alertas de desmatamento validados vinculados ao imóvel ou coordenadas
 *   - Dados do imóvel rural (CAR) incluindo área e status
 *
 * Diferença do MapBiomas Alerta Checker existente:
 *   - Esse checker foca em TERRITÓRIO e CONTEXTO do imóvel (o que está ao redor)
 *   - O MapBiomasAlertaChecker (já existente) foca nos ALERTAS de desmatamento em si
 *   - Esse usa queries diferentes: pointInformation e ruralProperty
 *
 * Endpoint: https://plataforma.alerta.mapbiomas.org/api/v2/graphql
 * Auth: MAPBIOMAS_EMAIL + MAPBIOMAS_PASSWORD (env vars) → signIn → Bearer token
 *
 * Docs: docs/SATELLITE_IMAGERY_ROADMAP.md
 */

import { SatelliteBaseChecker } from '../satellite-base.js';
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
import { mapBiomasQuery, mapBiomasConfigured } from '../../services/mapbiomas-auth.js';

// --- GraphQL queries ---

const POINT_INFORMATION_QUERY = `
  query PointInformation($swLat: Float!, $swLng: Float!, $neLat: Float!, $neLng: Float!) {
    pointInformation(boundingBox: {
      swLat: $swLat
      swLng: $swLng
      neLat: $neLat
      neLng: $neLng
    }) {
      territories {
        id
        name
        categoryName
      }
      ruralProperties {
        carCode
        areaHa
        stateAcronym
        carType
      }
      alerts {
        alertCode
        areaHa
        detectedAt
        publishedAt
        biomes
        crossedIndigenousLands
        crossedConservationUnitsArea
        statusName
      }
    }
  }
`;

const RURAL_PROPERTY_QUERY = `
  query RuralProperty($carCode: String!) {
    ruralProperty(carCode: $carCode) {
      propertyCode
      areaHa
      stateAcronym
      propertyType
      carUpdatedAt
      version
      boundingBox
      alerts {
        alertCode
        areaHa
        detectedAt
        publishedAt
        deforestationClasses
        crossedBiomes
        crossedIndigenousLands
        crossedConservationUnits
        statusName
      }
    }
  }
`;

// --- Checker ---

export class MapBiomasLandUseChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'MapBiomas Territory Intelligence',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Informações territoriais e alertas de desmatamento validados via MapBiomas Alerta. ' +
      'Retorna bioma, terras indígenas, unidades de conservação e histórico de alertas do imóvel.',
    priority: 8,
    supportedInputTypes: [InputType.COORDINATES, InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400,  // 24h (alertas atualizados semanalmente)
    timeout: 20000
  };

  // --- Main entrypoint ---

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (!mapBiomasConfigured()) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'MapBiomas credentials not configured (MAPBIOMAS_EMAIL / MAPBIOMAS_PASSWORD)',
        details: {
          setup: 'docs/SATELLITE_IMAGERY_ROADMAP.md',
          registration: 'https://plataforma.alerta.mapbiomas.org/sign-in'
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    if (input.type === InputType.COORDINATES) {
      return this.checkByCoordinates(input);
    }

    if (input.type === InputType.CAR) {
      return this.checkByCAR(input);
    }

    return {
      status: CheckStatus.NOT_APPLICABLE,
      message: 'Input type not supported. Use COORDINATES or CAR.',
      executionTimeMs: 0,
      cached: false
    };
  }

  // --- Check by GPS coordinates ---

  private async checkByCoordinates(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) throw new Error('Coordinates required');

    const { lat, lon } = input.coordinates;
    // Create a small bounding box around the point (±0.001° ≈ 110m)
    const delta = 0.001;

    const data = await mapBiomasQuery<{
      pointInformation: {
        territories: Array<{ id: number; name: string; categoryName: string }>;
        ruralProperties: Array<{ carCode: string; areaHa: number; stateAcronym: string; carType: string }>;
        alerts: Array<{
          alertCode: number;
          areaHa: number;
          detectedAt: string;
          publishedAt: string;
          biomes: string[];
          crossedIndigenousLands: string[];
          crossedConservationUnitsArea: number;
          statusName: string;
        }>;
      };
    }>(POINT_INFORMATION_QUERY, {
      swLat: lat - delta,
      swLng: lon - delta,
      neLat: lat + delta,
      neLng: lon + delta
    });

    const info = data.pointInformation;

    logger.debug(
      { lat, lon, territories: info.territories.length, alerts: info.alerts.length },
      'MapBiomas pointInformation result'
    );

    return this.buildResultFromPointInfo(info, { lat, lon });
  }

  // --- Check by CAR number ---

  private async checkByCAR(input: NormalizedInput): Promise<CheckerResult> {
    const carCode = input.value;

    const data = await mapBiomasQuery<{
      ruralProperty: {
        propertyCode: string;
        areaHa: number;
        stateAcronym: string;
        propertyType: string;
        carUpdatedAt: string;
        version: string;
        boundingBox: number[];
        alerts: Array<{
          alertCode: number;
          areaHa: number;
          detectedAt: string;
          publishedAt: string;
          deforestationClasses: string[];
          crossedBiomes: string[];
          crossedIndigenousLands: string[];
          crossedConservationUnits: string[];
          statusName: string;
        }>;
      } | null;
    }>(RURAL_PROPERTY_QUERY, { carCode });

    const property = data.ruralProperty;

    if (!property) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: `CAR ${carCode} not found in MapBiomas Alerta registry`,
        details: { car_number: carCode },
        executionTimeMs: 0,
        cached: false
      };
    }

    return this.buildResultFromRuralProperty(property, carCode);
  }

  // --- Build result from pointInformation ---

  private buildResultFromPointInfo(
    info: {
      territories: Array<{ id: number; name: string; categoryName: string }>;
      ruralProperties: Array<{ carCode: string; areaHa: number; stateAcronym: string; carType: string }>;
      alerts: Array<{ alertCode: number; areaHa: number; detectedAt: string; publishedAt: string; biomes: string[]; crossedIndigenousLands: string[]; crossedConservationUnitsArea: number; statusName: string }>;
    },
    location: { lat: number; lon: number }
  ): CheckerResult {
    const alerts = info.alerts ?? [];
    const recentAlerts = this.filterRecentAlerts(alerts, 2);

    // Territory classification
    const biome           = info.territories?.find(t => t.categoryName === 'biome');
    const indigenousLands = info.territories?.filter(t => t.categoryName?.toLowerCase().includes('indigenous')) ?? [];
    const conservUnits    = info.territories?.filter(t => t.categoryName?.toLowerCase().includes('conservation')) ?? [];

    const inProtectedArea = indigenousLands.length > 0 || conservUnits.length > 0;
    const ruralProperties = info.ruralProperties ?? [];

    const evidence = {
      dataSource: 'MapBiomas Alerta (validated deforestation + territory)',
      url: 'https://plataforma.alerta.mapbiomas.org',
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      location,
      biome: biome?.name ?? 'unknown',
      territories: info.territories?.map(t => ({ name: t.name, category: t.categoryName })),
      indigenous_lands: indigenousLands.map(t => t.name),
      conservation_units: conservUnits.map(t => t.name),
      rural_properties_at_point: ruralProperties.map(p => ({
        car_code: p.carCode,
        area_ha: p.areaHa,
        state: p.stateAcronym
      })),
      total_alerts_in_vicinity: alerts.length,
      recent_alerts_2y: recentAlerts.length
    };

    if (inProtectedArea && recentAlerts.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.CRITICAL,
        message: `Deforestation in protected area: ${[...indigenousLands, ...conservUnits].map(t => t.name).join(', ')}`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(recentAlerts)
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (recentAlerts.length > 0) {
      const totalHa = recentAlerts.reduce((s, a) => s + (a.areaHa ?? 0), 0);
      return {
        status: CheckStatus.FAIL,
        severity: totalHa >= 25 ? Severity.HIGH : Severity.MEDIUM,
        message: `${recentAlerts.length} validated deforestation alert(s) in vicinity (last 2 years, ${Math.round(totalHa)} ha)`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(recentAlerts)
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (inProtectedArea) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message: `Location is within or near a protected area: ${[...indigenousLands, ...conservUnits].map(t => t.name).join(', ')}`,
        details: baseDetails,
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message: 'No deforestation alerts or protected area overlaps detected in vicinity',
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  // --- Build result from ruralProperty ---

  private buildResultFromRuralProperty(
    property: {
      propertyCode: string;
      areaHa: number;
      stateAcronym: string;
      propertyType: string;
      carUpdatedAt: string;
      version: string;
      alerts: Array<{ alertCode: number; areaHa: number; detectedAt: string; publishedAt: string; deforestationClasses: string[]; crossedBiomes: string[]; crossedIndigenousLands: string[]; crossedConservationUnits: string[]; statusName: string }>;
    },
    carCode: string
  ): CheckerResult {
    const alerts       = property.alerts ?? [];
    const recentAlerts = this.filterRecentAlerts(alerts, 2);

    const totalAreaHa      = recentAlerts.reduce((s, a) => s + (a.areaHa ?? 0), 0);
    const hasProtectedArea = alerts.some(
      a => (a.crossedIndigenousLands?.length ?? 0) > 0 || (a.crossedConservationUnits?.length ?? 0) > 0
    );

    const evidence = {
      dataSource: 'MapBiomas Alerta (validated deforestation, rural property)',
      url: `https://plataforma.alerta.mapbiomas.org/rural-property/${carCode}`,
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      car_number: carCode,
      property_area_ha: property.areaHa,
      state: property.stateAcronym,
      property_type: property.propertyType,
      car_updated_at: property.carUpdatedAt,
      total_alerts_ever: alerts.length,
      recent_alerts_2y: recentAlerts.length,
      deforested_area_ha_2y: Math.round(totalAreaHa)
    };

    if (hasProtectedArea && recentAlerts.length > 0) {
      const protectedNames = [
        ...new Set(alerts.flatMap(a => [...(a.crossedIndigenousLands ?? []), ...(a.crossedConservationUnits ?? [])]))
      ].filter(Boolean);
      return {
        status: CheckStatus.FAIL,
        severity: Severity.CRITICAL,
        message: `Deforestation within protected area(s) in CAR property: ${protectedNames.join(', ')}`,
        details: { ...baseDetails, protected_areas: protectedNames, alerts: this.formatAlerts(recentAlerts) },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (recentAlerts.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: totalAreaHa >= 25 ? Severity.HIGH : Severity.MEDIUM,
        message: `${recentAlerts.length} validated deforestation alert(s) in CAR property (last 2 years, ${Math.round(totalAreaHa)} ha)`,
        details: { ...baseDetails, alerts: this.formatAlerts(recentAlerts) },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    if (alerts.length > 0) {
      const oldestAlert = [...alerts].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))[0];
      return {
        status: CheckStatus.WARNING,
        severity: Severity.LOW,
        message: `${alerts.length} historical deforestation alert(s) in CAR property (oldest: ${oldestAlert.detectedAt})`,
        details: {
          ...baseDetails,
          note: 'All alerts are older than 2 years',
          historical_alerts: this.formatAlerts(alerts.slice(0, 5))
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    return {
      status: CheckStatus.PASS,
      message: 'No validated deforestation alerts found for this CAR property',
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  // --- Helpers ---

  private filterRecentAlerts<T extends { publishedAt: string }>(alerts: T[], years: number): T[] {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return alerts.filter(a => new Date(a.publishedAt) >= cutoff);
  }

  private formatAlerts(alerts: Array<Record<string, any>>) {
    return alerts.slice(0, 10).map(a => ({
      alert_code:           a.alertCode,
      area_ha:              a.areaHa,
      detected_at:          a.detectedAt,
      published_at:         a.publishedAt,
      deforestation_class:  Array.isArray(a.deforestationClasses) ? a.deforestationClasses[0] : (a.deforestationClasses ?? null),
      biome:                a.crossedBiomes?.[0] ?? a.biomes?.[0] ?? null
    }));
  }
}

export default new MapBiomasLandUseChecker();
