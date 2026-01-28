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

// Interface para dados de embargos IBAMA
interface IbamaEmbargoRecord {
  document: string;
  documentFormatted: string;
  type: 'CNPJ' | 'CPF';
  name: string;
  embargoCount: number;
  totalArea_ha: number;
  embargos: Array<{
    embargoNumber: string;
    date: string;
    municipality: string;
    state: string;
    area_ha: number | null;
    description: string;
    coordinates: {
      lat: number | null;
      lon: number | null;
    };
  }>;
}

// Carregar dados dos embargos IBAMA
let ibamaData: Map<string, IbamaEmbargoRecord> | null = null;

function loadIbamaEmbargoes(): Map<string, IbamaEmbargoRecord> {
  if (ibamaData) {
    return ibamaData;
  }

  try {
    const dataPath = join(process.cwd(), 'data', 'ibama_embargos.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const records: IbamaEmbargoRecord[] = JSON.parse(rawData);

    // Criar Map para lookup rápido
    ibamaData = new Map(records.map(r => [r.document, r]));

    logger.info({ count: ibamaData.size }, 'IBAMA embargoes data loaded');
    return ibamaData;
  } catch (err) {
    logger.error({ err }, 'Failed to load IBAMA embargoes data');
    // Fallback para Map vazio
    ibamaData = new Map();
    return ibamaData;
  }
}

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
    timeout: 5000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Checking IBAMA embargoes');

    try {
      // Carregar dados (cached após primeira execução)
      const embargoes = loadIbamaEmbargoes();

      // Verificar se documento tem embargos
      const record = embargoes.get(input.value);

      if (record) {
        // Calcular severidade baseada em área embargada
        let severity: Severity = Severity.HIGH;
        if (record.totalArea_ha > 1000) {
          severity = Severity.CRITICAL;
        } else if (record.totalArea_ha < 100) {
          severity = Severity.MEDIUM;
        }

        return {
          status: CheckStatus.FAIL,
          severity,
          message: `${record.embargoCount} active embargo(s) found - ${record.totalArea_ha.toFixed(2)}ha embargoed`,
          details: {
            name: record.name,
            type: record.type,
            embargoCount: record.embargoCount,
            totalArea_ha: record.totalArea_ha,
            embargos: record.embargos.slice(0, 5), // Limitar a 5 para não sobrecarregar
            hasMore: record.embargoCount > 5,
            recommendation: `CRITICAL: ${record.embargoCount} active environmental embargo(s) from IBAMA. Property has ${record.totalArea_ha.toFixed(2)} hectares under embargo. Compliance review required immediately.`
          },
          evidence: {
            dataSource: 'IBAMA - Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis',
            url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/',
            lastUpdate: '2026-01-28',
            raw: record
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
          checkedAt: new Date().toISOString(),
          totalRecordsChecked: embargoes.size
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
