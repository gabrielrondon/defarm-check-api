/**
 * SNAP Protected Areas Checker - Uruguay
 *
 * Fonte: SNAP - Sistema Nacional de Áreas Protegidas (Uruguay)
 * Cobertura: 22 áreas protegidas (367,683 hectares / 1.16% do território)
 *
 * O que verifica:
 * - Se coordenadas caem dentro de área protegida do SNAP
 * - Categoria da área (Parque Nacional, Monumento Natural, etc)
 * - Status legal da área
 *
 * Impacto Legal:
 * - Atividades em áreas protegidas requerem autorizações especiais
 * - Restrições de uso dependem da categoria da área
 * - Lei 17.234/2000 - Sistema Nacional de Áreas Protegidas
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
import { NormalizedInput, InputType, Country } from '../../types/input.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class SNAPProtectedAreasChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'SNAP Protected Areas',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica se coordenadas sobrepõem áreas protegidas do SNAP (Uruguay)',
    priority: 8,
    supportedInputTypes: [InputType.COORDINATES, InputType.ADDRESS],
    supportedCountries: [Country.URUGUAY]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000,  // 30 dias (áreas protegidas não mudam frequentemente)
    timeout: 5000  // 5s
  };

  /**
   * Check se coordenadas caem em área protegida SNAP
   */
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value, country: input.country }, 'Checking SNAP protected areas');

    if (!input.coordinates) {
      throw new Error('Coordinates required for SNAP protected areas check');
    }

    try {
      const { lat, lon } = input.coordinates;

      // Validar coordenadas para Uruguay
      // Uruguay bounds: aproximadamente -35.7 to -30.1 lat, -58.5 to -53.1 lon
      if (!this.isValidUruguayCoordinate(lat, lon)) {
        throw new Error('Invalid coordinates for Uruguay');
      }

      // Query espacial: ST_Intersects(geometry, point)
      // Verificar se ponto está dentro de alguma área protegida
      const query = `
        SELECT
          name,
          category,
          area_ha,
          department,
          municipality,
          legal_status,
          established_date
        FROM snap_areas_uruguay
        WHERE ST_Intersects(
          geometry,
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        LIMIT 1;
      `;

      const result = await db.execute(sql.raw(query));
      const area = result.rows[0];

      if (area) {
        // Coordenadas caem em área protegida - FAIL
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: `Coordinates fall within SNAP protected area: ${area.name}`,
          details: {
            areaName: area.name,
            category: area.category,
            areaHa: area.area_ha,
            department: area.department,
            municipality: area.municipality,
            legalStatus: area.legal_status,
            establishedDate: area.established_date,
            coordinates: { lat, lon },
            source: 'SNAP - Sistema Nacional de Áreas Protegidas',
            recommendation: 'HIGH RISK: Property/activity overlaps with protected area. Activities in SNAP areas require special authorization from Ministry of Environment (Ley 17.234/2000).',
            legalFramework: 'Ley 17.234 (2000) - Sistema Nacional de Áreas Protegidas',
            regulatoryBody: 'DINABISE - Ministerio de Ambiente'
          },
          evidence: {
            dataSource: 'SNAP (Uruguay)',
            url: 'https://www.ambiente.gub.uy/snap',
            lastUpdate: '2025-08'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      // Coordenadas NÃO estão em área protegida - PASS
      return {
        status: CheckStatus.PASS,
        message: 'Coordinates do not overlap with any SNAP protected area',
        details: {
          coordinates: { lat, lon },
          totalAreasChecked: 22,
          source: 'SNAP - Sistema Nacional de Áreas Protegidas'
        },
        evidence: {
          dataSource: 'SNAP (Uruguay)',
          url: 'https://www.ambiente.gub.uy/snap',
          lastUpdate: '2025-08'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      logger.error({ err }, 'Error checking SNAP protected areas');
      throw err;
    }
  }

  /**
   * Valida se coordenadas estão dentro dos limites do Uruguay
   */
  private isValidUruguayCoordinate(lat: number, lon: number): boolean {
    // Uruguay bounds (aproximado):
    // Latitude: -35.7 (sul) to -30.1 (norte)
    // Longitude: -58.5 (oeste) to -53.1 (leste)
    const LAT_MIN = -35.8;
    const LAT_MAX = -30.0;
    const LON_MIN = -58.6;
    const LON_MAX = -53.0;

    return (
      lat >= LAT_MIN &&
      lat <= LAT_MAX &&
      lon >= LON_MIN &&
      lon <= LON_MAX
    );
  }
}

export default new SNAPProtectedAreasChecker();
