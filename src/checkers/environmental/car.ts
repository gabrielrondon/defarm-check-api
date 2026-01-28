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

// Mock data - em produção viria do SICAR
const mockCARDatabase = new Map([
  ['BA-1234567-ABCDEFGHIJKLMNOPQRSTUVWXYZ', { status: 'ATIVO', pendencias: [] }],
  ['SP-9999999-ZYXWVUTSRQPONMLKJIHGFEDCBA', { status: 'PENDENTE', pendencias: ['Sobreposição com UC'] }],
  ['12345678000190', { car: 'BA-1234567-ABCDEFGHIJKLMNOPQRSTUVWXYZ', status: 'ATIVO' }]
]);

export class CARChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'CAR Registry',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica situação do Cadastro Ambiental Rural (SICAR)',
    priority: 8,
    supportedInputTypes: [InputType.CAR, InputType.CNPJ]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000, // 30 dias (dados relativamente estáveis)
    timeout: 10000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking CAR registry');

    try {
      await this.simulateAPICall();

      // Buscar CAR
      let carData = mockCARDatabase.get(input.value);

      // Se input é CNPJ, buscar CAR associado
      if (input.type === InputType.CNPJ && carData && 'car' in carData) {
        const carNumber = carData.car;
        carData = mockCARDatabase.get(carNumber);
      }

      if (!carData) {
        return {
          status: CheckStatus.WARNING,
          severity: Severity.MEDIUM,
          message: 'CAR not found or not registered',
          details: {
            recommendation: 'Property should be registered in SICAR'
          },
          evidence: {
            dataSource: 'SICAR - Sistema Nacional de Cadastro Ambiental Rural',
            url: 'https://www.car.gov.br/'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      const hasPendencies = 'pendencias' in carData && carData.pendencias.length > 0;
      const isActive = carData.status === 'ATIVO';

      if (!isActive || hasPendencies) {
        return {
          status: CheckStatus.FAIL,
          severity: hasPendencies ? Severity.HIGH : Severity.MEDIUM,
          message: `CAR status: ${carData.status}${hasPendencies ? ' with pendencies' : ''}`,
          details: {
            status: carData.status,
            pendencies: 'pendencias' in carData ? carData.pendencias : [],
            recommendation: 'Resolve CAR pendencies before proceeding'
          },
          evidence: {
            dataSource: 'SICAR',
            url: 'https://www.car.gov.br/'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'CAR is active with no pendencies',
        details: {
          status: carData.status,
          checkedAt: new Date().toISOString()
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check CAR registry: ${(err as Error).message}`);
    }
  }

  private async simulateAPICall(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

export default new CARChecker();
