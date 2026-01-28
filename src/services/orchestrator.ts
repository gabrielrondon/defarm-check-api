import { v4 as uuidv4 } from 'uuid';
import { CheckRequest, NormalizedInput } from '../types/input.js';
import { CheckResponse, SourceResult } from '../types/verdict.js';
import { checkerRegistry } from '../checkers/index.js';
import { normalizeInput } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { db } from '../db/client.js';
import { checkRequests } from '../db/schema.js';
import { config } from '../config/index.js';
import {
  calculateScore,
  determineVerdict,
  generateSummary,
  calculateCacheHitRate
} from './verdict.js';

export class OrchestratorService {
  // Executa check completo
  async executeCheck(request: CheckRequest): Promise<CheckResponse> {
    const startTime = Date.now();
    const checkId = `chk_${uuidv4().replace(/-/g, '')}`;

    logger.info({ checkId, input: request.input }, 'Starting check');

    try {
      // 1. Normalizar input
      const normalizedInput = this.normalizeInput(request.input);

      // 2. Selecionar checkers
      const checkers = this.selectCheckers(normalizedInput, request.options?.sources);

      logger.debug({ count: checkers.length }, 'Selected checkers');

      // 3. Executar checkers em paralelo
      const results = await Promise.all(
        checkers.map(async (checker) => {
          const result = await checker.check(normalizedInput);
          return {
            name: checker.metadata.name,
            category: checker.metadata.category,
            ...result
          } as SourceResult;
        })
      );

      // 4. Calcular veredito e score
      const verdict = determineVerdict(results);
      const score = calculateScore(results);
      const summary = generateSummary(results);
      const processingTimeMs = Date.now() - startTime;

      // 5. Montar resposta
      const timestamp = new Date().toISOString();
      const response: CheckResponse = {
        checkId,
        input: {
          type: request.input.type,
          value: request.input.value
        },
        timestamp,
        verdict,
        score,
        sources: results,
        summary,
        metadata: {
          processingTimeMs,
          cacheHitRate: calculateCacheHitRate(results),
          apiVersion: config.api.version,
          timestamp
        }
      };

      // 6. Persistir no banco (async, não bloqueia resposta)
      this.persistCheck(checkId, normalizedInput, response).catch(err => {
        logger.error({ err }, 'Failed to persist check');
      });

      logger.info(
        { checkId, verdict, score, processingTimeMs },
        'Check completed'
      );

      return response;
    } catch (err) {
      logger.error({ err, checkId }, 'Check execution failed');
      throw err;
    }
  }

  // Normaliza input
  private normalizeInput(input: any): NormalizedInput {
    const normalized: NormalizedInput = {
      type: input.type,
      value: normalizeInput(input.type, input.value),
      originalValue: input.value
    };

    // Se for coordenadas, salvar objeto também
    if (input.type === 'COORDINATES' && typeof input.value === 'object') {
      normalized.coordinates = input.value;
    }

    return normalized;
  }

  // Seleciona checkers baseado no input e opções
  private selectCheckers(input: NormalizedInput, sources?: string[]) {
    let checkers = checkerRegistry.getApplicable(input.type);

    // Filtrar por sources específicas se solicitado
    if (sources && sources.length > 0 && !sources.includes('all')) {
      checkers = checkers.filter(c =>
        sources.includes(c.metadata.name) ||
        sources.includes(c.metadata.category)
      );
    }

    return checkers;
  }

  // Persiste check no banco
  private async persistCheck(
    checkId: string,
    input: NormalizedInput,
    response: CheckResponse
  ): Promise<void> {
    try {
      await db.insert(checkRequests).values({
        id: checkId,
        inputType: input.type,
        inputValue: input.originalValue.toString(),
        inputNormalized: input.value,
        verdict: response.verdict,
        score: response.score,
        sourcesChecked: response.sources.map(s => s.name),
        results: response.sources,
        summary: response.summary,
        metadata: response.metadata,
        processingTimeMs: response.metadata.processingTimeMs
      });
    } catch (err) {
      logger.error({ err }, 'Failed to persist check to database');
      throw err;
    }
  }

  // Busca check por ID
  async getCheckById(checkId: string): Promise<CheckResponse | null> {
    try {
      const result = await db
        .select()
        .from(checkRequests)
        .where(eq(checkRequests.id, checkId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const record = result[0];

      return {
        checkId: record.id,
        input: {
          type: record.inputType,
          value: record.inputValue
        },
        timestamp: record.createdAt.toISOString(),
        verdict: record.verdict as any,
        score: record.score || 0,
        sources: record.results as SourceResult[],
        summary: record.summary as any,
        metadata: record.metadata as any
      };
    } catch (err) {
      logger.error({ err, checkId }, 'Failed to get check from database');
      return null;
    }
  }
}

export const orchestratorService = new OrchestratorService();

// Import eq for query
import { eq } from 'drizzle-orm';
