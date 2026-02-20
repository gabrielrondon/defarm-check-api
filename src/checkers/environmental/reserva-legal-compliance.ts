/**
 * Reserva Legal Compliance Checker
 *
 * Verifica conformidade de Reserva Legal do imóvel rural via MapBiomas Alerta.
 * Usa a query ruralProperty para obter todos os alertas de desmatamento vinculados
 * ao CAR e avalia se há desmatamento recente que compromete a RL.
 *
 * Critérios de análise:
 * - Alertas de desmatamento validados dentro do imóvel (últimos 5 anos)
 * - Desmatamento em área de Reserva Legal ou APP (overlaps com TIs/UCs)
 * - Proporção de área desmatada em relação ao total do imóvel
 *
 * Para análise completa da RL é necessário o shapefile da RL do SICAR.
 * Este checker avalia o risco baseado em evidências de desmatamento.
 *
 * Endpoint: https://plataforma.alerta.mapbiomas.org/api/v2/graphql
 * Auth: MAPBIOMAS_EMAIL + MAPBIOMAS_PASSWORD
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
import { logger } from '../../utils/logger.js';
import { mapBiomasQuery, mapBiomasConfigured } from '../../services/mapbiomas-auth.js';

// Thresholds for RL risk assessment
const DEFORESTED_PCT_FAIL    = 5;   // > 5% of total area deforested → FAIL
const DEFORESTED_PCT_WARN    = 2;   // 2-5% → WARNING
const RECENT_YEARS           = 5;   // Analyse alerts from last 5 years

const RURAL_PROPERTY_QUERY = `
  query RuralProperty($carCode: String!) {
    ruralProperty(carCode: $carCode) {
      propertyCode
      areaHa
      state
      stateAcronym
      carType
      carUpdatedAt
      version
      alerts {
        alertCode
        areaHa
        detectedAt
        publishedAt
        deforestationClasses
        crossedBiomes
        crossedIndigenousLands
        crossedConservationUnits
        crossedLegalReserves { totalAreaHa legalReserveId }
        crossedLegalReservesArea
        crossedPermanentProtectedAreas { totalAreaHa permanentProtectedAreaId }
        crossedPermanentProtectedArea
        statusName
      }
    }
  }
`;

interface RuralPropertyAlert {
  alertCode: number;
  areaHa: number;
  detectedAt: string;
  publishedAt: string;
  deforestationClasses: string[];
  crossedBiomes: string[];
  crossedIndigenousLands: string[];
  crossedConservationUnits: string[];
  crossedLegalReserves: Array<{ totalAreaHa: number; legalReserveId: number }>;
  crossedLegalReservesArea: number;
  crossedPermanentProtectedAreas: Array<{ totalAreaHa: number; permanentProtectedAreaId: number }>;
  crossedPermanentProtectedArea: number;  // total APP area overlapping (ha)
  statusName: string;
}

interface RuralProperty {
  propertyCode: string;
  areaHa: number;
  stateAcronym: string;
  propertyType: string;
  carUpdatedAt: string;
  version: string;
  alerts: RuralPropertyAlert[];
}

export class ReservaLegalComplianceChecker extends SatelliteBaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Reserva Legal Compliance (MapBiomas)',
    category: CheckerCategory.ENVIRONMENTAL,
    description:
      'Avalia risco de não conformidade com Reserva Legal baseado em alertas de desmatamento ' +
      'validados pelo MapBiomas Alerta vinculados ao imóvel CAR.',
    priority: 7,
    supportedInputTypes: [InputType.CAR]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24h
    timeout: 20000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (!mapBiomasConfigured()) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'MapBiomas credentials not configured (MAPBIOMAS_EMAIL / MAPBIOMAS_PASSWORD)',
        details: { setup: 'docs/SATELLITE_IMAGERY_ROADMAP.md' },
        executionTimeMs: 0,
        cached: false
      };
    }

    if (input.type !== InputType.CAR) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Reserva Legal check requires CAR input',
        executionTimeMs: 0,
        cached: false
      };
    }

    const carCode = input.value;

    const data = await mapBiomasQuery<{ ruralProperty: RuralProperty | null }>(
      RURAL_PROPERTY_QUERY,
      { carCode }
    );

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

    logger.debug(
      { carCode, alerts: property.alerts?.length ?? 0, areaHa: property.areaHa },
      'MapBiomas ruralProperty result for RL check'
    );

    return this.analyzeCompliance(property, carCode);
  }

  private analyzeCompliance(property: RuralProperty, carCode: string): CheckerResult {
    const allAlerts    = property.alerts ?? [];
    const recentAlerts = this.recentAlerts(allAlerts, RECENT_YEARS);

    const totalPropertyHa = property.areaHa ?? 0;
    const deforestedHa    = recentAlerts.reduce((s, a) => s + (a.areaHa ?? 0), 0);
    const deforestedPct   = totalPropertyHa > 0 ? (deforestedHa / totalPropertyHa) * 100 : 0;

    // Protected area overlaps
    const hasProtectedOverlap = recentAlerts.some(
      a => (a.crossedIndigenousLands?.length ?? 0) > 0 || (a.crossedConservationUnits?.length ?? 0) > 0
    );
    const protectedNames = [
      ...new Set(recentAlerts.flatMap(a => [
        ...(a.crossedIndigenousLands ?? []),
        ...(a.crossedConservationUnits ?? [])
      ]))
    ].filter(Boolean);

    // Reserva Legal direct overlaps (crossedLegalReserves is what we really want)
    const rlOverlapAlerts = recentAlerts.filter(
      a => (a.crossedLegalReserves?.length ?? 0) > 0 || (a.crossedLegalReservesArea ?? 0) > 0
    );
    const totalRlOverlapHa = recentAlerts.reduce(
      (s, a) => s + (a.crossedLegalReservesArea ?? a.crossedLegalReserves?.reduce((rs, r) => rs + (r.totalAreaHa ?? 0), 0) ?? 0),
      0
    );

    // APP overlaps
    const appOverlapAlerts = recentAlerts.filter(
      a => (a.crossedPermanentProtectedAreas?.length ?? 0) > 0 || (a.crossedPermanentProtectedArea ?? 0) > 0
    );
    const totalAppOverlapHa = recentAlerts.reduce(
      (s, a) => s + (a.crossedPermanentProtectedArea ?? a.crossedPermanentProtectedAreas?.reduce((rs, r) => rs + (r.totalAreaHa ?? 0), 0) ?? 0),
      0
    );

    const biomes = [...new Set(recentAlerts.flatMap(a => a.crossedBiomes ?? []))].filter(Boolean);
    const deforestationClasses = [...new Set(recentAlerts.flatMap(a =>
      Array.isArray(a.deforestationClasses) ? a.deforestationClasses : [a.deforestationClasses as string]
    ))].filter(Boolean);

    const evidence = {
      dataSource: 'MapBiomas Alerta — Reserva Legal Risk Assessment',
      url: `https://plataforma.alerta.mapbiomas.org/rural-property/${carCode}`,
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    const baseDetails = {
      car_number:               carCode,
      property_area_ha:         Math.round(totalPropertyHa),
      state:                    property.stateAcronym,
      property_type:            property.propertyType,
      car_updated_at:           property.carUpdatedAt,
      alerts_last_5y:           recentAlerts.length,
      total_alerts_historical:  allAlerts.length,
      deforested_ha_last_5y:    Math.round(deforestedHa),
      deforested_pct_last_5y:   parseFloat(deforestedPct.toFixed(2)),
      rl_overlap_alerts:        rlOverlapAlerts.length,
      rl_overlap_area_ha:       Math.round(totalRlOverlapHa),
      app_overlap_alerts:       appOverlapAlerts.length,
      app_overlap_area_ha:      Math.round(totalAppOverlapHa),
      biomes_affected:          biomes,
      deforestation_classes:    deforestationClasses,
      protected_area_overlap:   protectedNames,
      methodology:
        'Risk estimated from MapBiomas-validated deforestation alerts within property boundaries. ' +
        'crossedLegalReserves = deforestation that overlapped declared Reserva Legal. ' +
        'crossedPermanentProtectedAreas = deforestation that overlapped APP.'
    };

    // CRITICAL: deforestation directly within declared Reserva Legal (crossedLegalReserves)
    if (rlOverlapAlerts.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.CRITICAL,
        message:
          `CRITICAL: Deforestation detected INSIDE declared Reserva Legal. ` +
          `${rlOverlapAlerts.length} alert(s), ${Math.round(totalRlOverlapHa)} ha in last ${RECENT_YEARS} years.`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(rlOverlapAlerts),
          recommendation:
            'Deforestation confirmed within declared Reserva Legal area. ' +
            'This directly violates Código Florestal (Lei 12.651/2012). ' +
            'Immediate action required: IBAMA embargo, property regularization.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // CRITICAL: deforestation in protected area (TI, UC)
    if (hasProtectedOverlap && recentAlerts.length > 0) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.CRITICAL,
        message:
          `CRITICAL: Deforestation detected in protected area(s): ${protectedNames.join(', ')}. ` +
          `${recentAlerts.length} alert(s), ${Math.round(deforestedHa)} ha in last ${RECENT_YEARS} years.`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(recentAlerts),
          recommendation:
            'Immediate environmental compliance review required. ' +
            'Deforestation in protected area may constitute criminal offense (Lei 9.605/98).'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // FAIL: significant deforestation within property
    if (deforestedPct > DEFORESTED_PCT_FAIL || (recentAlerts.length > 0 && deforestedHa >= 25)) {
      return {
        status: CheckStatus.FAIL,
        severity: Severity.HIGH,
        message:
          `Reserva Legal at risk: ${Math.round(deforestedHa)} ha deforested (${deforestedPct.toFixed(1)}% of property) ` +
          `in last ${RECENT_YEARS} years (${recentAlerts.length} validated alert(s)).`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(recentAlerts),
          recommendation:
            'Significant deforestation detected within CAR property. ' +
            'Reserva Legal may be non-compliant with Código Florestal (Lei 12.651/2012).'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // WARNING: minor deforestation
    if (deforestedPct > DEFORESTED_PCT_WARN || recentAlerts.length > 0) {
      return {
        status: CheckStatus.WARNING,
        severity: Severity.MEDIUM,
        message:
          `Minor deforestation detected: ${Math.round(deforestedHa)} ha (${deforestedPct.toFixed(1)}% of property) ` +
          `in last ${RECENT_YEARS} years (${recentAlerts.length} alert(s)).`,
        details: {
          ...baseDetails,
          alerts: this.formatAlerts(recentAlerts),
          recommendation:
            'Cross-check with SICAR Reserva Legal shapefile to verify if affected area overlaps RL declaration.'
        },
        evidence,
        executionTimeMs: 0,
        cached: false
      };
    }

    // PASS
    const passMessage = allAlerts.length > 0
      ? `No recent deforestation risk detected. ${allAlerts.length} historical alert(s) are older than ${RECENT_YEARS} years.`
      : 'No deforestation alerts found. Reserva Legal appears uncompromised.';

    return {
      status: CheckStatus.PASS,
      message: passMessage,
      details: baseDetails,
      evidence,
      executionTimeMs: 0,
      cached: false
    };
  }

  private recentAlerts(alerts: RuralPropertyAlert[], years: number): RuralPropertyAlert[] {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return alerts.filter(a => new Date(a.publishedAt ?? a.detectedAt) >= cutoff);
  }

  private formatAlerts(alerts: RuralPropertyAlert[]) {
    return alerts.slice(0, 10).map(a => ({
      alert_code:           a.alertCode,
      area_ha:              a.areaHa,
      detected_at:          a.detectedAt,
      published_at:         a.publishedAt,
      deforestation_class:  Array.isArray(a.deforestationClasses) ? a.deforestationClasses[0] : a.deforestationClasses,
      biome:                a.crossedBiomes?.[0],
      rl_overlap_ha:        a.crossedLegalReservesArea ?? 0,
      app_overlap_ha:       a.crossedPermanentProtectedArea ?? 0,
      status:               a.statusName
    }));
  }
}

export default new ReservaLegalComplianceChecker();
