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

export class DeforestationChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'PRODES Deforestation',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica desmatamento através de dados PRODES/DETER (INPE)',
    priority: 10,
    supportedInputTypes: [InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 dias (dados atualizados mensalmente)
    timeout: 8000 // 8s (benchmark PRODES P95: 51ms, mas dataset completo pode ser maior)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking deforestation data');

    if (!input.coordinates) {
      throw new Error('Coordinates required for deforestation check');
    }

    try {
      // Query PostGIS: verificar se coordenadas estão em área de desmatamento
      const result = await db.execute<{
        municipality: string;
        state: string;
        area_ha: number;
        year: number;
        path_row: string;
      }>(sql`
        SELECT municipality, state, area_ha, year, path_row
        FROM prodes_deforestation
        WHERE ST_Contains(
          geometry,
          ST_SetSRID(ST_MakePoint(${input.coordinates.lon}, ${input.coordinates.lat}), 4326)
        )
        ORDER BY year DESC
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        const data = result.rows[0];

        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: `Deforestation detected: ${data.area_ha}ha in ${data.year}`,
          details: {
            area_ha: data.area_ha,
            year: data.year,
            municipality: data.municipality,
            state: data.state,
            path_row: data.path_row,
            coordinates: input.coordinates,
            recommendation: 'HIGH: Deforestation detected at this location. Environmental compliance review required.'
          },
          evidence: {
            dataSource: 'INPE PRODES - Programa de Monitoramento do Desmatamento',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: '2025-12-01'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'No deforestation detected at this location',
        details: {
          coordinates: input.coordinates,
          checkedAt: new Date().toISOString()
        },
        evidence: {
          dataSource: 'INPE PRODES',
          url: 'http://terrabrasilis.dpi.inpe.br/',
          lastUpdate: '2025-12-01'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check deforestation data: ${(err as Error).message}`);
    }
  }
}

export default new DeforestationChecker();
