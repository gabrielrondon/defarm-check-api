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
import { listaSuja } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export class SlaveLaborChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Slave Labor Registry',
    category: CheckerCategory.SOCIAL,
    description: 'Verifica se CNPJ/CPF está na Lista Suja do Trabalho Escravo (MTE)',
    priority: 9,
    supportedInputTypes: [InputType.CNPJ, InputType.CPF]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400, // 24 horas (lista atualiza semestralmente)
    timeout: 5000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking slave labor registry');

    try {
      // Query banco de dados
      const results = await db
        .select()
        .from(listaSuja)
        .where(eq(listaSuja.document, input.value))
        .limit(1);

      const record = results[0];

      if (record) {
        return {
          status: CheckStatus.FAIL,
          severity: Severity.CRITICAL,
          message: `Found in slave labor registry: ${record.name}`,
          details: {
            employerName: record.name,
            type: record.type,
            state: record.state,
            address: record.address,
            year: record.year,
            workersAffected: record.workersAffected,
            cnae: record.cnae,
            inclusionDate: record.inclusionDate,
            source: 'MTE - Lista Suja do Trabalho Escravo',
            recommendation: 'CRITICAL: Immediate compliance review required. This entity has been found guilty of submitting workers to conditions analogous to slavery.'
          },
          evidence: {
            dataSource: 'Ministério do Trabalho e Emprego - Cadastro de Empregadores',
            url: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_empregadores.xlsx',
            lastUpdate: '2026-01-28',
            raw: {
              document: record.document,
              documentFormatted: record.documentFormatted,
              type: record.type,
              name: record.name,
              year: record.year,
              state: record.state,
              address: record.address,
              workersAffected: record.workersAffected,
              cnae: record.cnae,
              inclusionDate: record.inclusionDate
            }
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'Not found in slave labor registry',
        details: {
          source: 'MTE - Lista Suja do Trabalho Escravo',
          checkedAt: new Date().toISOString()
        },
        evidence: {
          dataSource: 'Ministério do Trabalho e Emprego',
          url: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_empregadores.xlsx',
          lastUpdate: '2026-01-28'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check slave labor registry: ${(err as Error).message}`);
    }
  }
}

export default new SlaveLaborChecker();
