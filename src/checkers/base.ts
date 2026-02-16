import {
  CheckerCategory,
  CheckStatus,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  Severity
} from '../types/checker.js';
import { NormalizedInput, InputType, Country } from '../types/input.js';
import { cacheService } from '../services/cache.js';
import { logger } from '../utils/logger.js';
import { CheckerError } from '../utils/errors.js';

export abstract class BaseChecker {
  // Metadados do checker (implementado por subclasses)
  abstract readonly metadata: CheckerMetadata;
  abstract readonly config: CheckerConfig;

  // Método principal que executa o check
  abstract executeCheck(input: NormalizedInput): Promise<CheckerResult>;

  // Método público com cache e error handling
  async check(input: NormalizedInput): Promise<CheckerResult> {
    const startTime = Date.now();

    try {
      // Verificar se é aplicável
      if (!this.isApplicable(input)) {
        return this.notApplicableResult();
      }

      // Tentar cache primeiro
      if (this.config.enabled && input.value) {
        const cached = await cacheService.get<CheckerResult>(
          input.type,
          input.value,
          this.metadata.name
        );

        if (cached) {
          logger.debug({ checker: this.metadata.name }, 'Using cached result');
          return { ...cached, cached: true };
        }
      }

      // Executar check com timeout
      const result = await this.withTimeout(
        this.executeCheck(input),
        this.config.timeout
      );

      // Cache do resultado
      if (this.config.enabled && input.value && result.status !== CheckStatus.ERROR) {
        await cacheService.set(
          input.type,
          input.value,
          this.metadata.name,
          result,
          this.config.cacheTTL
        );
      }

      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
        cached: false
      };
    } catch (err) {
      logger.error({ err, checker: this.metadata.name }, 'Checker execution error');
      return this.errorResult(err as Error, Date.now() - startTime);
    }
  }

  // Verifica se o checker é aplicável ao input
  protected isApplicable(input: NormalizedInput): boolean {
    // Verifica tipo de input
    const typeSupported = this.metadata.supportedInputTypes.includes(input.type);
    if (!typeSupported) {
      return false;
    }

    // Verifica país (backwards compatibility: se não especificado, assume Brasil)
    const supportedCountries = this.metadata.supportedCountries || [Country.BRAZIL];
    const countrySupported = supportedCountries.includes(input.country);

    return countrySupported;
  }

  // Resultado quando não é aplicável
  protected notApplicableResult(): CheckerResult {
    return {
      status: CheckStatus.NOT_APPLICABLE,
      message: 'Checker not applicable for this input type',
      executionTimeMs: 0,
      cached: false
    };
  }

  // Resultado de erro
  protected errorResult(error: Error, executionTime: number): CheckerResult {
    return {
      status: CheckStatus.ERROR,
      message: `Error executing checker: ${error.message}`,
      details: {
        error: error.name,
        stack: error.stack
      },
      executionTimeMs: executionTime,
      cached: false
    };
  }

  // Wrapper para timeout
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Checker timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }
}
