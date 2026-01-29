/**
 * DETER Alert Checker - Detecta desmatamento em tempo real
 *
 * Fonte: INPE DETER-B (Detecção de Desmatamento em Tempo Real)
 * Cobertura: Amazônia Legal
 * Frequência: Alertas diários
 *
 * O que verifica:
 * - Se coordenadas caem em área com alerta recente de desmatamento
 * - Alertas dos últimos 90 dias (configur ável)
 * - Classes: DESMATAMENTO_VEG, DEGRADACAO, MINERACAO, etc
 *
 * Diferencial: PRODES é anual, DETER é DIÁRIO
 */

import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckStatus,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class DeterAlertChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'DETER Real-Time Alerts',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica alertas de desmatamento em tempo real do INPE DETER-B (últimos 90 dias)',
    priority: 9,
    supportedInputTypes: [InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400,  // 24h (alertas mudam diariamente)
    timeout: 10000  // 10s (query espacial pode ser lenta)
  };

  /**
   * Check se coordenadas caem em alerta DETER recente
   */
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking DETER alerts');

    if (!input.coordinates) {
      throw new Error('Coordinates required for DETER check');
    }

    try {
      const { lat, lon } = input.coordinates;

      // Validar coordenadas
      if (!this.isValidCoordinate(lat, lon)) {
        throw new Error('Invalid coordinates for Amazônia Legal');
      }

      // Query espacial: ST_Contains(geometry, point)
      // Buscar alertas dos últimos 90 dias que contenham este ponto
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const query = `
        SELECT
          alert_date,
          area_ha,
          municipality,
          state,
          classname,
          sensor,
          path_row
        FROM deter_alerts
        WHERE
          alert_date >= '${cutoffDateStr}'
          AND ST_Contains(
            geometry,
            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
          )
        ORDER BY alert_date DESC
        LIMIT 1;
      `;

      const result = await db.execute(sql.raw(query));

      if (!result.rows || result.rows.length === 0) {
        // Nenhum alerta recente nesta localização = PASS
        return {
          status: CheckStatus.PASS,
          message: 'No recent DETER alerts at this location (last 90 days)',
          details: {
            coordinates: { lat, lon },
            daysChecked: 90,
            checkedAt: new Date().toISOString()
          },
          evidence: {
            dataSource: 'INPE DETER-B',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Alerta encontrado = FAIL
      const alert = result.rows[0];

      // Calcular severidade baseada na classe e quanto tempo atrás
      const alertDate = new Date(alert.alert_date as string);
      const daysAgo = Math.floor((Date.now() - alertDate.getTime()) / (1000 * 60 * 60 * 24));

      // Classes mais graves
      const criticalClasses = ['DESMATAMENTO_VEG', 'DESMATAMENTO_CR', 'CORTE_SELETIVO'];
      const highClasses = ['DEGRADACAO', 'MINERACAO'];

      let severity: Severity;
      if (criticalClasses.includes(alert.classname as string)) {
        severity = Severity.CRITICAL;
      } else if (highClasses.includes(alert.classname as string)) {
        severity = Severity.HIGH;
      } else {
        severity = Severity.MEDIUM;
      }

      // Recentidade aumenta severidade
      if (daysAgo <= 7) {
        severity = Severity.CRITICAL;  // Alerta dos últimos 7 dias = crítico
      }

      return {
        status: CheckStatus.FAIL,
        severity,
        message: `Recent deforestation alert detected: ${alert.classname} (${daysAgo} days ago)`,
        details: {
          alertDate: alert.alert_date,
          daysAgo,
          areaHa: alert.area_ha,
          municipality: alert.municipality,
          state: alert.state,
          classname: alert.classname,
          sensor: alert.sensor,
          pathRow: alert.path_row,
          coordinates: { lat, lon },
          recommendation: this.getRecommendation(severity, daysAgo, alert.classname as string)
        },
        evidence: {
          dataSource: 'INPE DETER-B - Sistema de Detecção de Desmatamento em Tempo Real',
          url: 'http://terrabrasilis.dpi.inpe.br/',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };

    } catch (err) {
      throw new Error(`Failed to check DETER alerts: ${(err as Error).message}`);
    }
  }

  /**
   * Validar coordenadas (devem estar na Amazônia Legal)
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    // Amazônia Legal aproximadamente:
    // Latitude: -18° a +5°
    // Longitude: -74° a -42°
    return (
      lat >= -18 && lat <= 5 &&
      lon >= -74 && lon <= -42
    );
  }

  /**
   * Gerar recomendação baseada na severidade
   */
  private getRecommendation(severity: Severity, daysAgo: number, classname: string): string {
    if (severity === Severity.CRITICAL) {
      if (daysAgo <= 7) {
        return `CRITICAL: Recent deforestation detected (${daysAgo} days ago). Class: ${classname}. This location has been flagged for illegal deforestation in the last week. EUDR compliance violation. Do not proceed with any transactions from this area.`;
      }
      return `CRITICAL: Deforestation detected (${daysAgo} days ago). Class: ${classname}. This area has been flagged for illegal activity. Immediate compliance review required before any transactions.`;
    }

    if (severity === Severity.HIGH) {
      return `HIGH: Environmental degradation detected (${daysAgo} days ago). Class: ${classname}. Property requires environmental compliance verification before proceeding.`;
    }

    return `MEDIUM: Environmental alert detected (${daysAgo} days ago). Class: ${classname}. Review environmental status of this location.`;
  }
}

export default new DeterAlertChecker();
