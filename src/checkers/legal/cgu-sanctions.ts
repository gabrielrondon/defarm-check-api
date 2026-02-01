/**
 * CGU Sanctions Checker
 *
 * Verifica se empresa/pessoa está registrada em listas de sanções da CGU:
 * - CEIS: Cadastro de Empresas Inidôneas e Suspensas
 * - CNEP: Cadastro Nacional de Empresas Punidas (Lei Anticorrupção)
 * - CEAF: Cadastro de Expulsões da Administração Federal
 *
 * Fonte: Portal da Transparência - CGU
 * URL: https://portaldatransparencia.gov.br/sancoes
 */

import { BaseChecker } from '../base.js';
import { CheckerCategory, CheckerResult, CheckStatus, Severity } from '../../types/checker.js';
import { InputType, NormalizedInput } from '../../types/input.js';
import { db } from '../../db/client.js';
import { cguSancoes } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export class CguSanctionsChecker extends BaseChecker {
  metadata = {
    name: 'CGU Sanctions',
    category: CheckerCategory.LEGAL,
    description: 'Verifica sanções do governo federal (CEIS, CNEP, CEAF)',
    dataSource: 'Portal da Transparência - CGU',
    dataSourceUrl: 'https://portaldatransparencia.gov.br/sancoes',
    priority: 10, // Alta prioridade - sanções são bloqueantes
    supportedInputTypes: [InputType.CNPJ, InputType.CPF]
  };

  config = {
    enabled: true,
    cacheTTL: 86400, // 24 horas (dados não mudam frequentemente)
    timeout: 5000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    // CGU só funciona com CPF ou CNPJ
    if (input.type !== InputType.CNPJ && input.type !== InputType.CPF) {
      return {
        status: CheckStatus.NOT_APPLICABLE,
        message: 'Tipo de entrada não suportado',
        details: null,
        executionTimeMs: 0,
        cached: false
      };
    }

    const document = input.value;

    // Buscar sanções no banco
    const sanctions = await db
      .select()
      .from(cguSancoes)
      .where(eq(cguSancoes.document, document));

    if (sanctions.length === 0) {
      return {
        status: CheckStatus.PASS,
        message: 'Não encontrado em listas de sanções da CGU',
        details: {
          document,
          sanctionsFound: 0,
          sources: ['CEIS', 'CNEP', 'CEAF']
        },
        executionTimeMs: 0,
        cached: false
      };
    }

    // Agrupar sanções por tipo
    const grouped = sanctions.reduce((acc, sanction) => {
      const type = sanction.sanctionType || 'UNKNOWN';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push({
        category: sanction.category,
        description: sanction.description,
        startDate: sanction.startDate,
        endDate: sanction.endDate,
        organ: sanction.sanctioningOrgan,
        processNumber: sanction.processNumber,
        status: sanction.status
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Contar sanções ativas
    const activeSanctions = sanctions.filter(s => {
      if (s.status !== 'ATIVO') return false;
      if (s.endDate) {
        const endDate = new Date(s.endDate);
        return endDate > new Date();
      }
      return true;
    });

    return {
      status: CheckStatus.FAIL,
      message: `Encontrado em ${Object.keys(grouped).join(', ')}`,
      severity: activeSanctions.length > 0 ? Severity.CRITICAL : Severity.HIGH,
      details: {
        document,
        name: sanctions[0].name,
        totalSanctions: sanctions.length,
        activeSanctions: activeSanctions.length,
        sanctionsByType: grouped,
        types: Object.keys(grouped),
        warning: 'Empresa/pessoa sancionada pelo governo federal',
        impact: 'Impedimento de contratar com setor público e restrições comerciais'
      },
      executionTimeMs: 0,
      cached: false
    };
  }

  /**
   * Valida se há dados disponíveis para o checker funcionar
   */
  async validateDataAvailability(): Promise<boolean> {
    try {
      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(cguSancoes)
        .limit(1);

      const count = result[0]?.count || 0;
      return count > 0;
    } catch (error) {
      console.error('Failed to validate CGU data availability:', error);
      return false;
    }
  }
}

export default new CguSanctionsChecker();
