/**
 * CAR Checker - Verifica regularização ambiental via CAR
 *
 * Fonte: SICAR - Sistema Nacional de Cadastro Ambiental Rural
 * Cobertura: Estados prioritários MT, PA, GO (90% do agro brasileiro)
 *
 * O que verifica:
 * - Se coordenadas caem em propriedade com CAR válido
 * - Status do CAR (Ativo, Pendente, Cancelado, Suspenso)
 * - Dados do proprietário para rastreabilidade
 *
 * Impacto Legal:
 * - NÃO ter CAR = IRREGULARIDADE GRAVE (Lei 12.651/2012 - Código Florestal)
 * - CAR obrigatório para produtores desde 2014
 * - Sem CAR: impossível obter crédito rural, licenças, comercializar
 * - TACs de frigoríficos exigem CAR ativo
 *
 * IMPORTANTE:
 * - TER CAR ATIVO = PASS (regularizado) ✅
 * - NÃO TER CAR = FAIL (irregular) ❌
 * - CAR CANCELADO/SUSPENSO = FAIL (irregular) ❌
 * - CAR PENDENTE = WARNING (em regularização) ⚠️
 */

import { BaseChecker } from '../base.js';
import { CheckerResult, CheckInput, CheckerMetadata } from '../../types/checker.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class CARChecker extends BaseChecker {
  metadata: CheckerMetadata = {
    name: 'CAR - Cadastro Ambiental Rural',
    category: 'environmental',
    description: 'Verifica se propriedade possui CAR (Cadastro Ambiental Rural) válido',
    dataSource: 'SICAR - Sistema Nacional de Cadastro Ambiental Rural',
    version: '1.0.0'
  };

  config = {
    enabled: true,
    timeout: 10000,  // 10s
    cache: {
      enabled: true,
      ttl: 2592000  // 30 dias (CAR não muda frequentemente)
    }
  };

  /**
   * Check se coordenadas caem em propriedade com CAR
   */
  async check(input: CheckInput): Promise<CheckerResult> {
    const startTime = Date.now();

    // CAR só funciona com coordenadas
    if (input.type !== 'COORDINATES') {
      return {
        ...this.metadata,
        status: 'NOT_APPLICABLE',
        message: 'CAR check only applies to coordinates',
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
          ...this.metadata,
          status: 'FAIL',
          severity: 'HIGH',
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
          executionTimeMs: Date.now() - startTime
        };
      }

      // CAR encontrado - avaliar status
      const car = result.rows[0];
      const status = String(car.status || 'UNKNOWN').toUpperCase();

      // Determinar severity e message baseado no status
      let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      let checkStatus: 'PASS' | 'FAIL' = 'PASS';
      let message = '';

      if (status === 'ATIVO') {
        // CAR ATIVO = PASS ✅
        checkStatus = 'PASS';
        severity = 'LOW';
        message = `Location has active CAR registration: ${car.car_number}`;
      } else if (status === 'PENDENTE') {
        // CAR PENDENTE = WARNING (ainda regularizando)
        checkStatus = 'FAIL';
        severity = 'MEDIUM';
        message = `Location has pending CAR registration: ${car.car_number}`;
      } else if (status === 'CANCELADO' || status === 'SUSPENSO') {
        // CAR CANCELADO/SUSPENSO = FAIL ❌
        checkStatus = 'FAIL';
        severity = 'HIGH';
        message = `Location has ${status.toLowerCase()} CAR registration: ${car.car_number}`;
      } else {
        // Status desconhecido = WARNING
        checkStatus = 'FAIL';
        severity = 'MEDIUM';
        message = `Location has CAR registration with unknown status: ${car.car_number}`;
      }

      return {
        ...this.metadata,
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
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('CAR check failed', { error, input });
      return {
        ...this.metadata,
        status: 'ERROR',
        message: `Failed to check CAR: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
