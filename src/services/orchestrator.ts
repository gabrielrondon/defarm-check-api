import { v4 as uuidv4 } from 'uuid';
import { CheckRequest, NormalizedInput, Country } from '../types/input.js';
import { CheckResponse, SourceResult } from '../types/verdict.js';
import { checkerRegistry } from '../checkers/index.js';
import { normalizeInput, detectCountryFromInputType } from '../utils/validators.js';
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
import { deriveL2Insights } from './insights-l2.js';
import { deriveL3Insights } from './insights-l3.js';
import { geocodingService } from './geocoding.js';
import { InputType } from '../types/input.js';
import { CheckerSourceAdapter, SourceOrchestrator } from './source-orchestrator.js';
import { deriveCompositeSources } from './derived-source-orchestrator.js';

export class OrchestratorService {
  // Executa check completo
  async executeCheck(request: CheckRequest): Promise<CheckResponse> {
    const startTime = Date.now();
    const checkId = uuidv4(); // UUID válido para PostgreSQL

    logger.info({ checkId, input: request.input }, 'Starting check');

    try {
      // 1. Normalizar input (geocode address if needed)
      const normalizedInput = await this.normalizeInput(request.input);

      // 2. Selecionar fontes e executar checkers por fonte
      const sourceOrchestrator = new SourceOrchestrator(
        checkerRegistry.getActive().map((checker) => new CheckerSourceAdapter(checker))
      );
      const selectedSources = sourceOrchestrator.selectApplicable(normalizedInput, request.options?.sources);
      logger.debug({ count: selectedSources.length }, 'Selected sources');

      // 3. Executar fontes em paralelo
      const baseResults: SourceResult[] = await sourceOrchestrator.execute(
        normalizedInput,
        request.options?.sources
      );
      const derivedResults = deriveCompositeSources(baseResults);
      const results: SourceResult[] = [...baseResults, ...derivedResults];

      // 4. Calcular veredito e score
      const verdict = determineVerdict(results);
      const score = calculateScore(results);
      const summary = generateSummary(results);
      const l2 = deriveL2Insights(results, summary);
      const l3 = await deriveL3Insights(normalizedInput.country, score, results);
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
        insights: {
          l2,
          l3
        },
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
  private async normalizeInput(input: any): Promise<NormalizedInput> {
    // Detectar país (pode vir explícito ou ser auto-detectado)
    const country = detectCountryFromInputType(input.type, input.country);

    // Handle ADDRESS type - geocode to coordinates
    if (input.type === InputType.ADDRESS) {
      const address = String(input.value);
      logger.debug({ address, country }, 'Geocoding address');

      try {
        const geocoded = await geocodingService.geocode(address);

        const normalized: NormalizedInput = {
          type: InputType.COORDINATES, // Convert to COORDINATES for checkers
          value: `${geocoded.coordinates.lat},${geocoded.coordinates.lon}`,
          originalValue: address,
          country, // Preserve country
          coordinates: geocoded.coordinates,
          metadata: {
            originalType: InputType.ADDRESS,
            geocodingResult: geocoded,
            address: geocoded.displayName
          }
        };

        logger.info(
          {
            address,
            country,
            coordinates: geocoded.coordinates,
            source: geocoded.source
          },
          'Address geocoded successfully'
        );

        return normalized;
      } catch (err) {
        logger.error(
          { address, error: (err as Error).message },
          'Failed to geocode address'
        );
        throw new Error(`Failed to geocode address "${address}": ${(err as Error).message}`);
      }
    }

    // Handle other input types
    const normalized: NormalizedInput = {
      type: input.type,
      value: normalizeInput(input.type, input.value),
      originalValue: input.value,
      country // Add country to normalized input
    };

    // Se for coordenadas, salvar objeto também
    if (input.type === InputType.COORDINATES && typeof input.value === 'object') {
      normalized.coordinates = input.value;
    }

    return normalized;
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
        country: input.country, // Add country
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
