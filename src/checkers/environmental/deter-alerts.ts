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
import { CheckerResult, CheckInput, CheckerMetadata } from '../../types/checker.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class DeterAlertChecker extends BaseChecker {
  metadata: CheckerMetadata = {
    name: 'DETER Real-Time Alerts',
    category: 'environmental',
    description: 'Verifica alertas de desmatamento em tempo real do INPE DETER-B (últimos 90 dias)',
    dataSource: 'INPE DETER-B - Sistema de Detecção de Desmatamento em Tempo Real',
    version: '1.0.0'
  };

  config = {
    enabled: true,
    timeout: 10000,  // 10s (query espacial pode ser lenta)
    cache: {
      enabled: true,
      ttl: 86400  // 24h (alertas mudam diariamente)
    }
  };

  /**
   * Check se coordenadas caem em alerta DETER recente
   */
  async check(input: CheckInput): Promise<CheckerResult> {
    const startTime = Date.now();

    // DETER só funciona com coordenadas
    if (input.type !== 'COORDINATES') {
      return {
        ...this.metadata,
        status: 'NOT_APPLICABLE',
        message: 'DETER alerts only apply to coordinates',
        executionTimeMs: Date.now() - startTime
      };
    }

    try {
      const { lat, lon } = input.value as { lat: number; lon: number };

      // Validar coordenadas
      if (!this.isValidCoordinate(lat, lon)) {
        return {
          ...this.metadata,
          status: 'ERROR',
          message: 'Invalid coordinates',
          executionTimeMs: Date.now() - startTime
        };
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
          ...this.metadata,
          status: 'PASS',
          message: 'No recent DETER alerts at this location (last 90 days)',
          details: {
            coordinates: { lat, lon },
            daysChecked: 90,
            checkedAt: new Date().toISOString()
          },
          executionTimeMs: Date.now() - startTime
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

      let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
      if (criticalClasses.includes(alert.classname as string)) {
        severity = 'CRITICAL';
      } else if (highClasses.includes(alert.classname as string)) {
        severity = 'HIGH';
      } else {
        severity = 'MEDIUM';
      }

      // Recentidade aumenta severidade
      if (daysAgo <= 7) {
        severity = 'CRITICAL';  // Alerta dos últimos 7 dias = crítico
      }

      return {
        ...this.metadata,
        status: 'FAIL',
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
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('DETER check failed', { error, input });
      return {
        ...this.metadata,
        status: 'ERROR',
        message: `Failed to check DETER alerts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime
      };
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
  private getRecommendation(severity: string, daysAgo: number, classname: string): string {
    if (severity === 'CRITICAL') {
      if (daysAgo <= 7) {
        return `CRITICAL: Recent deforestation detected (${daysAgo} days ago). Class: ${classname}. This location has been flagged for illegal deforestation in the last week. EUDR compliance violation. Do not proceed with any transactions from this area.`;
      }
      return `CRITICAL: Deforestation detected (${daysAgo} days ago). Class: ${classname}. This area has been flagged for illegal activity. Immediate compliance review required before any transactions.`;
    }

    if (severity === 'HIGH') {
      return `HIGH: Environmental degradation detected (${daysAgo} days ago). Class: ${classname}. Property requires environmental compliance verification before proceeding.`;
    }

    return `MEDIUM: Environmental alert detected (${daysAgo} days ago). Class: ${classname}. Review environmental status of this location.`;
  }
}
