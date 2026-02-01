/**
 * Utility for retrying operations with exponential backoff
 *
 * Critical for government APIs that are often unstable or rate-limited.
 */

import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelayMs: 1000,  // 1 second
  maxDelayMs: 60000,     // 1 minute max
  backoffMultiplier: 2,   // Double each time
  onRetry: () => {}
};

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  multiplier: number,
  maxDelay: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * ```typescript
 * const data = await retryWithBackoff(
 *   () => fetch('https://api.gov.br/data'),
 *   { maxRetries: 3, initialDelayMs: 2000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // If this was the last attempt, throw the error
      if (attempt === opts.maxRetries) {
        logger.error(
          { error: lastError.message },
          `Operation failed after ${opts.maxRetries} attempts`
        );
        throw lastError;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.backoffMultiplier,
        opts.maxDelayMs
      );

      // Log retry attempt
      logger.warn(
        {
          error: lastError.message,
          attempt,
          delayMs
        },
        `Attempt ${attempt}/${opts.maxRetries} failed, retrying in ${delayMs}ms`
      );

      // Call custom retry callback if provided
      opts.onRetry(attempt, lastError);

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed for unknown reason');
}

/**
 * Retry a fetch request with exponential backoff
 *
 * Special handling for HTTP errors, network errors, and timeouts.
 *
 * @example
 * ```typescript
 * const response = await retryFetch('https://api.gov.br/data', {
 *   method: 'GET',
 *   headers: { 'Accept': 'application/json' }
 * }, { maxRetries: 5 });
 * ```
 */
export async function retryFetch(
  url: string,
  fetchOptions: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, fetchOptions);

      // Consider 5xx errors as retryable
      if (response.status >= 500 && response.status < 600) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      // 4xx errors are usually not retryable (except 429 Rate Limit)
      if (response.status === 429) {
        // Extract Retry-After header if available
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const waitMs = parseInt(retryAfter) * 1000;
          logger.warn(`Rate limited, waiting ${waitMs}ms`);
          await sleep(waitMs);
          throw new Error('Rate limited, will retry');
        }
      }

      if (!response.ok && response.status >= 400 && response.status < 500) {
        // Don't retry 4xx errors (except 429)
        throw new Error(`Client error (not retrying): ${response.status} ${response.statusText}`);
      }

      return response;
    },
    retryOptions
  );
}

/**
 * Retry an axios request with exponential backoff
 *
 * For scripts using axios instead of fetch.
 */
export async function retryAxios<T = any>(
  axiosRequest: () => Promise<T>,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(
    async () => {
      try {
        return await axiosRequest();
      } catch (error: any) {
        // Axios wraps errors in response property
        if (error.response) {
          const status = error.response.status;

          // Retry 5xx errors
          if (status >= 500) {
            throw new Error(`Server error: ${status}`);
          }

          // Retry 429 Rate Limit
          if (status === 429) {
            throw new Error('Rate limited');
          }

          // Don't retry other 4xx errors
          if (status >= 400 && status < 500) {
            throw new Error(`Client error (not retrying): ${status}`);
          }
        }

        // Network errors, timeouts, etc - retry these
        throw error;
      }
    },
    retryOptions
  );
}

/**
 * Retry config optimized for government APIs
 *
 * Government APIs tend to be:
 * - Slow (high latency)
 * - Unstable (frequent 5xx errors)
 * - Rate-limited (need longer delays)
 */
export const GOVERNMENT_API_RETRY_CONFIG: RetryOptions = {
  maxRetries: 5,
  initialDelayMs: 2000,  // Start with 2 seconds (government APIs are slow)
  maxDelayMs: 60000,     // Up to 1 minute between retries
  backoffMultiplier: 2   // 2s, 4s, 8s, 16s, 32s, 60s
};

/**
 * Retry config for critical jobs
 *
 * More aggressive retries for jobs that MUST succeed (e.g., daily DETER)
 */
export const CRITICAL_JOB_RETRY_CONFIG: RetryOptions = {
  maxRetries: 10,        // Try many times
  initialDelayMs: 3000,  // Start with 3 seconds
  maxDelayMs: 300000,    // Up to 5 minutes between retries
  backoffMultiplier: 2
};
