/**
 * Conservation Unit Checker - Detecta sobreposição com Unidades de Conservação
 *
 * Fonte: ICMBio - Instituto Chico Mendes de Conservação da Biodiversidade
 * Cobertura: Todas UCs federais, estaduais e municipais no Brasil
 *
 * O que verifica:
 * - Se coordenadas caem dentro de Unidade de Conservação
 * - Grupo: Proteção Integral (mais restritivo) ou Uso Sustentável
 * - Categoria específica (Parque, Reserva, APA, etc)
 *
 * Impacto Legal:
 * - Proteção Integral: atividade econômica PROIBIDA (Lei 9.985/2000 - SNUC)
 * - Uso Sustentável: atividade regulamentada/restrita
 * - TACs de frigoríficos exigem essa verificação
 * - Multas milionárias + processo judicial
 */

import { BaseChecker } from '../base.js';
import { CheckerResult, CheckInput, CheckerMetadata } from '../../types/checker.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class ConservationUnitChecker extends BaseChecker {
  metadata: CheckerMetadata = {
    name: 'Conservation Units',
    category: 'environmental',
    description: 'Verifica se coordenadas sobrepõem Unidades de Conservação (ICMBio)',
    dataSource: 'ICMBio - Instituto Chico Mendes de Conservação da Biodiversidade',
    version: '1.0.0'
  };

  config = {
    enabled: true,
    timeout: 10000,  // 10s
    cache: {
      enabled: true,
      ttl: 2592000  // 30 dias (UCs não mudam rápido)
    }
  };

  /**
   * Check se coordenadas caem em Unidade de Conservação
   */
  async check(input: CheckInput): Promise<CheckerResult> {
    const startTime = Date.now();

    // UCs só funcionam com coordenadas
    if (input.type !== 'COORDINATES') {
      return {
        ...this.metadata,
        status: 'NOT_APPLICABLE',
        message: 'Conservation units check only applies to coordinates',
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
      // Verificar se ponto está dentro de alguma UC
      const query = `
        SELECT
          name,
          category,
          "group",
          area_ha,
          municipality,
          state,
          sphere
        FROM unidades_conservacao
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1;
      `;

      const result = await db.execute(sql.raw(query));

      if (!result.rows || result.rows.length === 0) {
        // Não está em UC = PASS
        return {
          ...this.metadata,
          status: 'PASS',
          message: 'Location is not within any Conservation Unit',
          details: {
            coordinates: { lat, lon },
            checkedAt: new Date().toISOString()
          },
          executionTimeMs: Date.now() - startTime
        };
      }

      // Unidade de Conservação detectada = FAIL
      const uc = result.rows[0];

      // Severidade baseada no grupo
      let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'CRITICAL';
      let groupDescription = '';

      if (uc.group === 'Proteção Integral') {
        severity = 'CRITICAL';
        groupDescription = 'Full Protection - economic activities strictly prohibited';
      } else if (uc.group === 'Uso Sustentável') {
        // Uso Sustentável ainda é restrito, mas menos severo
        severity = 'HIGH';
        groupDescription = 'Sustainable Use - economic activities regulated/restricted';
      } else {
        // Default: assume CRITICAL se não identificou
        severity = 'CRITICAL';
        groupDescription = 'under legal protection';
      }

      return {
        ...this.metadata,
        status: 'FAIL',
        severity,
        message: `Location overlaps with Conservation Unit: ${uc.name}`,
        details: {
          unidadeConservacao: uc.name,
          category: uc.category,
          group: uc.group,
          groupDescription,
          areaHa: uc.area_ha,
          municipality: uc.municipality,
          state: uc.state,
          sphere: uc.sphere,
          coordinates: { lat, lon },
          recommendation: this.getRecommendation(
            uc.name as string,
            uc.category as string,
            uc.group as string
          )
        },
        evidence: {
          dataSource: 'ICMBio - Instituto Chico Mendes de Conservação da Biodiversidade',
          url: 'https://www.gov.br/icmbio/pt-br/assuntos/biodiversidade/unidade-de-conservacao',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Conservation unit check failed', { error, input });
      return {
        ...this.metadata,
        status: 'ERROR',
        message: `Failed to check Conservation Units: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  private getRecommendation(name: string, category: string, group: string): string {
    if (group === 'Proteção Integral') {
      return `CRITICAL: This location is within the Conservation Unit "${name}" (${category}), classified as Full Protection (Proteção Integral). ` +
        `Economic activities, including agriculture and cattle ranching, are STRICTLY PROHIBITED within Full Protection Conservation Units according to Brazilian law (Lei 9.985/2000 - SNUC). ` +
        `Purchasing or producing products from this area constitutes a CRIMINAL OFFENSE under Environmental Crimes Law (Lei 9.605/98). ` +
        `This property MUST be excluded from any supply chain immediately. ` +
        `TAC (Termo de Ajustamento de Conduta) compliance requires blocking all suppliers from Conservation Units. ` +
        `Recommendation: DO NOT PROCEED with any transactions involving this location.`;
    } else if (group === 'Uso Sustentável') {
      return `HIGH RISK: This location is within the Conservation Unit "${name}" (${category}), classified as Sustainable Use (Uso Sustentável). ` +
        `Economic activities are REGULATED and RESTRICTED within Sustainable Use Conservation Units according to Brazilian law (Lei 9.985/2000 - SNUC). ` +
        `Specific authorization from environmental agencies is REQUIRED for any economic activity. ` +
        `Unauthorized activities constitute a CRIMINAL OFFENSE under Environmental Crimes Law (Lei 9.605/98). ` +
        `This property requires ADDITIONAL VERIFICATION of environmental licenses and authorizations. ` +
        `TAC compliance may require blocking suppliers without proper authorization. ` +
        `Recommendation: VERIFY environmental licenses before proceeding with transactions.`;
    } else {
      return `CRITICAL: This location is within the Conservation Unit "${name}" (${category}), which is under legal protection. ` +
        `Economic activities are strictly regulated or prohibited. ` +
        `Recommendation: DO NOT PROCEED with any transactions involving this location without proper legal verification.`;
    }
  }
}
