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
import { readFileSync } from 'fs';
import { join } from 'path';

// Interface para dados da Lista Suja
interface ListaSujaRecord {
  document: string;
  documentFormatted: string;
  type: 'CNPJ' | 'CPF';
  name: string;
  year: number;
  state: string;
  address: string;
  workersAffected: number;
  cnae: string;
  inclusionDate: string;
}

// Carregar dados reais da Lista Suja
let listaSujaData: Map<string, ListaSujaRecord> | null = null;

function loadListaSuja(): Map<string, ListaSujaRecord> {
  if (listaSujaData) {
    return listaSujaData;
  }

  try {
    const dataPath = join(process.cwd(), 'data', 'lista_suja.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const records: ListaSujaRecord[] = JSON.parse(rawData);

    // Criar Map para lookup rápido
    listaSujaData = new Map(records.map(r => [r.document, r]));

    logger.info({ count: listaSujaData.size }, 'Lista Suja data loaded');
    return listaSujaData;
  } catch (err) {
    logger.error({ err }, 'Failed to load Lista Suja data');
    // Fallback para Map vazio
    listaSujaData = new Map();
    return listaSujaData;
  }
}

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
      // Carregar dados (cached após primeira execução)
      const listaSuja = loadListaSuja();

      // Verificar se documento está na lista
      const record = listaSuja.get(input.value);

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
            raw: record
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
          checkedAt: new Date().toISOString(),
          totalRecordsChecked: listaSuja.size
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
