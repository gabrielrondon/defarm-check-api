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

// Mock data - em produção viria de consulta PostGIS no PRODES/DETER
const mockDeforestationData = new Map([
  ['-10.5,-55.2', { detected: true, area_ha: 15.3, year: 2024 }],
  ['-12.0,-50.0', { detected: false }]
]);

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
    timeout: 15000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking deforestation data');

    if (!input.coordinates) {
      throw new Error('Coordinates required for deforestation check');
    }

    try {
      await this.simulateAPICall();

      // Em produção: query PostGIS
      // const result = await this.queryPostGIS(input.coordinates);

      const key = `${input.coordinates.lat},${input.coordinates.lon}`;
      const data = mockDeforestationData.get(key);

      if (!data) {
        return {
          status: CheckStatus.PASS,
          message: 'No deforestation detected in this area',
          details: {
            coordinates: input.coordinates,
            checkedAt: new Date().toISOString()
          },
          evidence: {
            dataSource: 'INPE PRODES/DETER',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: '2025-12-01'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      if (data.detected) {
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: `Deforestation detected: ${data.area_ha}ha in ${data.year}`,
          details: {
            area_ha: data.area_ha,
            year: data.year,
            coordinates: input.coordinates,
            recommendation: 'Environmental compliance review required'
          },
          evidence: {
            dataSource: 'INPE PRODES',
            url: 'http://terrabrasilis.dpi.inpe.br/',
            lastUpdate: '2025-12-01'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'No deforestation detected',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check deforestation data: ${(err as Error).message}`);
    }
  }

  private async simulateAPICall(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Em produção: implementar query PostGIS
  // private async queryPostGIS(coords: Coordinates): Promise<any> {
  //   const query = `
  //     SELECT area_ha, year FROM prodes_deforestation
  //     WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
  //     ORDER BY year DESC LIMIT 1
  //   `;
  //   return await db.query(query, [coords.lon, coords.lat]);
  // }
}

export default new DeforestationChecker();
