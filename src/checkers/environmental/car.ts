/**
 * CAR Checker - Verifica regularização ambiental via CAR
 *
 * Fonte: SICAR - Sistema Nacional de Cadastro Ambiental Rural
 * Cobertura: Estados prioritários (MT, PA, GO, MS, RS, PR, SP, MG, BA, TO = 90% do agro)
 *
 * ESTRATÉGIA OTIMIZADA (Risk-Based):
 * - Dataset contém APENAS CAR irregulares (Cancelado, Suspenso, Pendente)
 * - Lógica invertida: NÃO encontrar = presumivelmente regular ✅
 * - Redução de ~2M registros para ~20-50k (viável para Railway)
 *
 * O que verifica:
 * - Se coordenadas caem em propriedade com CAR IRREGULAR
 * - Status: Cancelado, Suspenso, Pendente
 * - Dados do proprietário para rastreabilidade
 *
 * Lógica de resultado:
 * - NÃO encontrou CAR irregular = PASS ✅ (presumivelmente regular)
 * - Encontrou CAR CANCELADO/SUSPENSO = FAIL CRITICAL ❌
 * - Encontrou CAR PENDENTE = FAIL HIGH ⚠️
 *
 * Limitações:
 * - Não cobre todos os 27 estados (apenas 10 prioritários)
 * - Não detecta "ausência de CAR" (apenas CAR irregular)
 * - Para cobertura 100%, usar API oficial SICAR (mais lento)
 *
 * Impacto Legal:
 * - CAR obrigatório para produtores desde 2014 (Lei 12.651/2012)
 * - Sem CAR/CAR irregular: impossível obter crédito, licenças, comercializar
 * - TACs de frigoríficos exigem CAR ativo
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

export class CARChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'CAR - Cadastro Ambiental Rural',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica se propriedade possui CAR (Cadastro Ambiental Rural) válido',
    priority: 8,
    supportedInputTypes: [InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000,  // 30 dias (CAR não muda frequentemente)
    timeout: 10000  // 10s
  };

  /**
   * Check se coordenadas caem em propriedade com CAR
   */
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking CAR registration');

    if (!input.coordinates) {
      throw new Error('Coordinates required for CAR check');
    }

    try {
      const { lat, lon } = input.coordinates;

      // Validar coordenadas
      if (!this.isValidCoordinate(lat, lon)) {
        throw new Error('Invalid coordinates for Brazil');
      }

      // Query espacial: ST_Intersects(geometry, point)
      // Verificar se ponto está dentro de algum CAR
      const query = `
        SELECT
          car_number,
          status,
          owner_document,
          owner_name,
          property_name,
          area_ha,
          municipality,
          state
        FROM car_registrations
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1;
      `;

      const result = await db.execute(sql.raw(query));

      if (!result.rows || result.rows.length === 0) {
        // NÃO está em propriedade com CAR = FAIL CRÍTICO
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: 'Location does not have CAR (Cadastro Ambiental Rural) registration',
          details: {
            coordinates: { lat, lon },
            issue: 'NO_CAR_FOUND',
            recommendation: this.getRecommendation('NO_CAR'),
            legalImpact: 'Property without CAR is irregular according to Forest Code (Lei 12.651/2012). ' +
              'Required for credit, licenses, and commercialization. TAC compliance mandates CAR verification.'
          },
          evidence: {
            dataSource: 'SICAR - Sistema Nacional de Cadastro Ambiental Rural',
            url: 'https://www.car.gov.br/',
            lastUpdate: new Date().toISOString().split('T')[0]
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // CAR encontrado - avaliar status
      const car = result.rows[0];
      const status = String(car.status || 'UNKNOWN').toUpperCase();

      // Determinar severity e message baseado no status
      let severity: Severity = Severity.LOW;
      let checkStatus: CheckStatus = CheckStatus.PASS;
      let message = '';

      if (status === 'ATIVO') {
        // CAR ATIVO = PASS ✅
        checkStatus = CheckStatus.PASS;
        severity = Severity.LOW;
        message = `Location has active CAR registration: ${car.car_number}`;
      } else if (status === 'PENDENTE') {
        // CAR PENDENTE = WARNING (ainda regularizando)
        checkStatus = CheckStatus.FAIL;
        severity = Severity.MEDIUM;
        message = `Location has pending CAR registration: ${car.car_number}`;
      } else if (status === 'CANCELADO' || status === 'SUSPENSO') {
        // CAR CANCELADO/SUSPENSO = FAIL ❌
        checkStatus = CheckStatus.FAIL;
        severity = Severity.HIGH;
        message = `Location has ${status.toLowerCase()} CAR registration: ${car.car_number}`;
      } else {
        // Status desconhecido = WARNING
        checkStatus = CheckStatus.FAIL;
        severity = Severity.MEDIUM;
        message = `Location has CAR registration with unknown status: ${car.car_number}`;
      }

      return {
        status: checkStatus,
        severity,
        message,
        details: {
          carNumber: car.car_number,
          carStatus: status,
          ownerDocument: car.owner_document,
          ownerName: car.owner_name,
          propertyName: car.property_name,
          areaHa: car.area_ha,
          municipality: car.municipality,
          state: car.state,
          coordinates: { lat, lon },
          recommendation: this.getRecommendation(status)
        },
        evidence: {
          dataSource: 'SICAR - Sistema Nacional de Cadastro Ambiental Rural',
          url: `https://www.car.gov.br/publico/imoveis/index?car=${car.car_number}`,
          lastUpdate: new Date().toISOString().split('T')[0]
        },
        executionTimeMs: 0,
        cached: false
      };

    } catch (err) {
      throw new Error(`Failed to check CAR: ${(err as Error).message}`);
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
  private getRecommendation(status: string): string {
    if (status === 'ATIVO') {
      return 'PASS: Property has active CAR registration. Environmental regularization is in compliance. ' +
        'Verify that CAR data matches property documentation. ' +
        'Recommendation: PROCEED with transaction - property is environmentally regular.';
    } else if (status === 'PENDENTE') {
      return 'WARNING: Property has pending CAR registration. Environmental regularization is in progress. ' +
        'The property owner is working on compliance but has not completed all requirements. ' +
        'Recommendation: REQUEST proof of regularization progress and estimated completion date. ' +
        'Consider CONDITIONAL approval pending CAR activation.';
    } else if (status === 'CANCELADO') {
      return 'CRITICAL: Property has CANCELLED CAR registration. Environmental regularization is invalid. ' +
        'CAR was cancelled due to irregularities, false information, or owner request. ' +
        'Property is IRREGULAR according to Forest Code (Lei 12.651/2012). ' +
        'TAC compliance requires blocking suppliers with cancelled CAR. ' +
        'Recommendation: DO NOT PROCEED with transaction unless new valid CAR is provided.';
    } else if (status === 'SUSPENSO') {
      return 'HIGH RISK: Property has SUSPENDED CAR registration. Environmental regularization is suspended. ' +
        'CAR was suspended due to pending verification or irregularities. ' +
        'Property is temporarily IRREGULAR. ' +
        'Recommendation: REQUEST explanation for suspension and timeline for resolution. ' +
        'DO NOT PROCEED until CAR is reactivated.';
    } else if (status === 'NO_CAR') {
      return 'CRITICAL: Property does NOT have CAR registration. This is a SEVERE IRREGULARITY. ' +
        'CAR is MANDATORY for all rural properties since 2014 (Lei 12.651/2012 - Forest Code). ' +
        'Without CAR, the property cannot: obtain rural credit, environmental licenses, or legally commercialize products. ' +
        'TAC (Termo de Ajustamento de Conduta) compliance mandates blocking suppliers without CAR. ' +
        'Recommendation: DO NOT PROCEED with any transactions. REQUIRE valid CAR registration before any business.';
    } else {
      return 'UNKNOWN: CAR status could not be determined. ' +
        'Recommendation: VERIFY CAR status manually at www.car.gov.br before proceeding.';
    }
  }
}

export default new CARChecker();
