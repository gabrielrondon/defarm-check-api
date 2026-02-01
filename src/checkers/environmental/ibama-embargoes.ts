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
import { ibamaEmbargoes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export class IbamaEmbargoesChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'IBAMA Embargoes',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica embargos ambientais do IBAMA por CPF/CNPJ',
    priority: 9,
    supportedInputTypes: [InputType.CNPJ, InputType.CPF]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 dias (dados atualizados diariamente, mas estáveis)
    timeout: 3000 // 3s (queries de documento são rápidas: P95 ~10ms)
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking IBAMA embargoes');

    try {
      // Query banco de dados
      const results = await db
        .select()
        .from(ibamaEmbargoes)
        .where(eq(ibamaEmbargoes.document, input.value))
        .limit(1);

      const record = results[0];

      if (record) {
        // Calcular severidade baseada em área embargada
        let severity: Severity = Severity.HIGH;
        if (record.totalAreaHa > 1000) {
          severity = Severity.CRITICAL;
        } else if (record.totalAreaHa < 100) {
          severity = Severity.MEDIUM;
        }

        const embargosList = record.embargos as any[];

        return {
          status: CheckStatus.FAIL,
          severity,
          message: `${record.embargoCount} active embargo(s) found - ${record.totalAreaHa.toFixed(2)}ha embargoed`,
          details: {
            name: record.name,
            type: record.type,
            embargoCount: record.embargoCount,
            totalArea_ha: record.totalAreaHa,
            embargos: embargosList.slice(0, 5), // Limitar a 5 para não sobrecarregar
            hasMore: record.embargoCount > 5,
            recommendation: `CRITICAL: ${record.embargoCount} active environmental embargo(s) from IBAMA. Property has ${record.totalAreaHa.toFixed(2)} hectares under embargo. Compliance review required immediately.`
          },
          evidence: {
            dataSource: 'IBAMA - Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis',
            url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
            lastUpdate: '2026-01-28',
            raw: {
              document: record.document,
              documentFormatted: record.documentFormatted,
              type: record.type,
              name: record.name,
              embargoCount: record.embargoCount,
              totalArea_ha: record.totalAreaHa,
              embargos: embargosList
            }
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'No active IBAMA embargoes found',
        details: {
          source: 'IBAMA - Embargos Ambientais',
          checkedAt: new Date().toISOString()
        },
        evidence: {
          dataSource: 'IBAMA',
          url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
          lastUpdate: '2026-01-28'
        },
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`Failed to check IBAMA embargoes: ${(err as Error).message}`);
    }
  }
}

export default new IbamaEmbargoesChecker();
