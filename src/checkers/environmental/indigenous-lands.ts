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

export class IndigenousLandChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Indigenous Lands',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica se coordenadas sobrepõem Terras Indígenas demarcadas (FUNAI)',
    priority: 10,
    supportedInputTypes: [InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000,  // 30 dias (TIs não mudam rápido)
    timeout: 5000  // 5s (benchmark P95: 49ms em produção)
  };

  /**
   * Check se coordenadas caem em Terra Indígena
   */
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking indigenous lands');

    if (!input.coordinates) {
      throw new Error('Coordinates required for indigenous lands check');
    }

    try {
      const { lat, lon } = input.coordinates;

      // Validar coordenadas
      if (!this.isValidCoordinate(lat, lon)) {
        throw new Error('Invalid coordinates for Brazil');
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
          status: CheckStatus.PASS,
          message: 'Location is not within any Indigenous Land',
          details: {
            coordinates: { lat, lon },
            checkedAt: new Date().toISOString()
          },
          evidence: {
            dataSource: 'FUNAI',
            url: 'https://www.gov.br/funai/pt-br/atuacao/terras-indigenas',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Terra Indígena detectada = FAIL CRÍTICO
      const ti = result.rows[0];

      // Severidade baseada na fase da demarcação
      let severity: Severity = Severity.CRITICAL;
      let phaseDescription = '';

      switch (ti.phase) {
        case 'Regularizada':
          severity = Severity.CRITICAL;
          phaseDescription = 'fully regularized and protected by law';
          break;
        case 'Homologada':
          severity = Severity.CRITICAL;
          phaseDescription = 'officially recognized by Presidential decree';
          break;
        case 'Declarada':
          severity = Severity.HIGH;
          phaseDescription = 'declared but pending final regularization';
          break;
        default:
          severity = Severity.CRITICAL;
          phaseDescription = 'under legal protection';
      }

      return {
        status: CheckStatus.FAIL,
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
          recommendation: this.getRecommendation(ti.name as string, ti.phase as string, ti.etnia as string)
        },
        evidence: {
          dataSource: 'FUNAI - Fundação Nacional dos Povos Indígenas',
          url: 'https://www.gov.br/funai/pt-br/atuacao/terras-indigenas',
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };

    } catch (err) {
      throw new Error(`Failed to check Indigenous lands: ${(err as Error).message}`);
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

export default new IndigenousLandChecker();
