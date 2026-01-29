/**
 * Indigenous Land Checker - Detecta sobreposição com Terras Indígenas
 *
 * Fonte: FUNAI - Fundação Nacional dos Povos Indígenas
 * Cobertura: Todas Terras Indígenas demarcadas no Brasil
 *
 * O que verifica:
 * - Se coordenadas caem dentro de Terra Indígena
 * - Fase da demarcação (Declarada, Homologada, Regularizada)
 * - Etnia indígena
 *
 * Impacto Legal:
 * - Produzir/comprar em TI = CRIME (Lei 9.605/98)
 * - Multas milionárias + processo judicial
 * - TACs de frigoríficos exigem essa verificação
 */

import { BaseChecker } from '../base.js';
import { CheckerResult, CheckInput, CheckerMetadata } from '../../types/checker.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class IndigenousLandChecker extends BaseChecker {
  metadata: CheckerMetadata = {
    name: 'Indigenous Lands',
    category: 'environmental',
    description: 'Verifica se coordenadas sobrepõem Terras Indígenas demarcadas (FUNAI)',
    dataSource: 'FUNAI - Fundação Nacional dos Povos Indígenas',
    version: '1.0.0'
  };

  config = {
    enabled: true,
    timeout: 10000,  // 10s
    cache: {
      enabled: true,
      ttl: 2592000  // 30 dias (TIs não mudam rápido)
    }
  };

  /**
   * Check se coordenadas caem em Terra Indígena
   */
  async check(input: CheckInput): Promise<CheckerResult> {
    const startTime = Date.now();

    // TIs só funcionam com coordenadas
    if (input.type !== 'COORDINATES') {
      return {
        ...this.metadata,
        status: 'NOT_APPLICABLE',
        message: 'Indigenous lands check only applies to coordinates',
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

      // Query espacial: ST_Intersects(geometry, point)
      // Verificar se ponto está dentro de alguma TI
      const query = `
        SELECT
          name,
          etnia,
          phase,
          area_ha,
          municipality,
          state,
          modalidade
        FROM terras_indigenas
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1;
      `;

      const result = await db.execute(sql.raw(query));

      if (!result.rows || result.rows.length === 0) {
        // Não está em Terra Indígena = PASS
        return {
          ...this.metadata,
          status: 'PASS',
          message: 'Location is not within any Indigenous Land',
          details: {
            coordinates: { lat, lon },
            checkedAt: new Date().toISOString()
          },
          executionTimeMs: Date.now() - startTime
        };
      }

      // Terra Indígena detectada = FAIL CRÍTICO
      const ti = result.rows[0];

      // Severidade baseada na fase da demarcação
      let severity: 'CRITICAL' | 'HIGH' = 'CRITICAL';
      let phaseDescription = '';

      switch (ti.phase) {
        case 'Regularizada':
          severity = 'CRITICAL';
          phaseDescription = 'fully regularized and protected by law';
          break;
        case 'Homologada':
          severity = 'CRITICAL';
          phaseDescription = 'officially recognized by Presidential decree';
          break;
        case 'Declarada':
          severity = 'HIGH';
          phaseDescription = 'declared but pending final regularization';
          break;
        default:
          severity = 'CRITICAL';
          phaseDescription = 'under legal protection';
      }

      return {
        ...this.metadata,
        status: 'FAIL',
        severity,
        message: `Location overlaps with Indigenous Land: ${ti.name}`,
        details: {
          terraIndigena: ti.name,
          etnia: ti.etnia,
          phase: ti.phase,
          phaseDescription,
          areaHa: ti.area_ha,
          municipality: ti.municipality,
          state: ti.state,
          modalidade: ti.modalidade,
          coordinates: { lat, lon },
          recommendation: this.getRecommendation(ti.name, ti.phase as string, ti.etnia as string)
        },
        evidence: {
          dataSource: 'FUNAI - Fundação Nacional dos Povos Indígenas',
          url: 'https://www.gov.br/funai/pt-br/atuacao/terras-indigenas',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Indigenous land check failed', { error, input });
      return {
        ...this.metadata,
        status: 'ERROR',
        message: `Failed to check Indigenous lands: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Validar coordenadas (Brasil)
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    // Brasil aproximadamente:
    // Latitude: -34° a +6°
    // Longitude: -74° a -34°
    return (
      lat >= -34 && lat <= 6 &&
      lon >= -74 && lon <= -34
    );
  }

  /**
   * Gerar recomendação detalhada
   */
  private getRecommendation(name: string, phase: string, etnia: string): string {
    return `CRITICAL: This location is within the Indigenous Land "${name}" (${etnia} people), status: ${phase}. ` +
      `Economic activities on Indigenous Lands are strictly prohibited by Brazilian law (Federal Constitution Article 231). ` +
      `Purchasing or producing products from this area constitutes a CRIMINAL OFFENSE under Environmental Crimes Law (Lei 9.605/98). ` +
      `This property MUST be excluded from any supply chain immediately. ` +
      `TAC (Termo de Ajustamento de Conduta) compliance requires blocking all suppliers from Indigenous Lands. ` +
      `Recommendation: DO NOT PROCEED with any transactions involving this location.`;
  }
}
