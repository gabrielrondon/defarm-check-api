/**
 * Job Executor - Enhanced job execution with retry logic and failure tracking
 */

import { logger } from '../utils/logger.js';
import { telegram } from '../services/telegram.js';

interface JobMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastError: string | null;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 5000,     // 5s
  maxDelayMs: 300000,        // 5 min
  backoffMultiplier: 2
};

// Track metrics for each job
const jobMetrics = new Map<string, JobMetrics>();

// Critical failure thresholds
const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;
const CRITICAL_JOBS_FAILED_THRESHOLD = 2; // If 2+ jobs fail consecutively, alert

/**
 * Initialize metrics for a job
 */
function initJobMetrics(jobName: string): JobMetrics {
  if (!jobMetrics.has(jobName)) {
    jobMetrics.set(jobName, {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      lastSuccess: null,
      lastFailure: null,
      lastError: null
    });
  }
  return jobMetrics.get(jobName)!;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Execute job with retry logic
 */
async function executeWithRetry(
  jobName: string,
  handler: () => Promise<void>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ success: boolean; error?: string; attempts: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger.info({ jobName, attempt, maxRetries: config.maxRetries }, 'Executing job');

      await handler();

      logger.info({ jobName, attempt }, 'Job executed successfully');
      return { success: true, attempts: attempt };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.error({
        jobName,
        attempt,
        maxRetries: config.maxRetries,
        error: lastError.message
      }, 'Job execution failed');

      // If not the last attempt, wait before retrying
      if (attempt < config.maxRetries) {
        const delayMs = calculateRetryDelay(attempt, config);
        logger.info({ jobName, delayMs, nextAttempt: attempt + 1 }, 'Retrying job after delay');
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts: config.maxRetries
  };
}

/**
 * Update job metrics after execution
 */
function updateMetrics(jobName: string, success: boolean, error?: string): void {
  const metrics = initJobMetrics(jobName);

  metrics.totalExecutions++;

  if (success) {
    metrics.successCount++;
    metrics.consecutiveFailures = 0;
    metrics.lastSuccess = new Date();
  } else {
    metrics.failureCount++;
    metrics.consecutiveFailures++;
    metrics.lastFailure = new Date();
    metrics.lastError = error || null;
  }

  logger.info({
    jobName,
    totalExecutions: metrics.totalExecutions,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    consecutiveFailures: metrics.consecutiveFailures,
    successRate: ((metrics.successCount / metrics.totalExecutions) * 100).toFixed(1) + '%'
  }, 'Job metrics updated');
}

/**
 * Check if system is degraded (multiple jobs failing)
 */
function isSystemDegraded(): boolean {
  let criticalJobsCount = 0;

  for (const [jobName, metrics] of jobMetrics.entries()) {
    if (metrics.consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      criticalJobsCount++;
    }
  }

  return criticalJobsCount >= CRITICAL_JOBS_FAILED_THRESHOLD;
}

/**
 * Send critical alerts for consecutive failures
 */
async function checkAndAlertCriticalFailures(jobName: string, metrics: JobMetrics): Promise<void> {
  // Alert on specific consecutive failure thresholds
  if (metrics.consecutiveFailures === CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
    await telegram.sendMessage({
      text: `🔴 <b>ALERTA CRÍTICO: Job Falhando Consecutivamente</b>\n\n` +
        `🤖 Job: ${jobName}\n` +
        `❌ Falhas consecutivas: ${metrics.consecutiveFailures}\n` +
        `🕐 Última falha: ${metrics.lastFailure?.toLocaleString('pt-BR')}\n` +
        `💥 Último erro: ${metrics.lastError || 'Desconhecido'}\n\n` +
        `⚠️ <b>Job pode estar permanentemente quebrado. Investigação necessária!</b>`
    });
  }

  // Alert if system is degraded (multiple jobs failing)
  if (isSystemDegraded()) {
    const failedJobs = Array.from(jobMetrics.entries())
      .filter(([_, m]) => m.consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD)
      .map(([name, _]) => name);

    await telegram.sendMessage({
      text: `🚨 <b>ALERTA: SISTEMA DEGRADADO</b>\n\n` +
        `❌ Múltiplos jobs falhando:\n` +
        failedJobs.map(name => `  • ${name}`).join('\n') + '\n\n' +
        `⚠️ <b>Sistema pode estar com problemas críticos!</b>\n` +
        `🔧 Verificar:\n` +
        `  • Conectividade de rede\n` +
        `  • APIs externas\n` +
        `  • Banco de dados\n` +
        `  • Credenciais\n` +
        `  • Limites de recursos`
    });
  }
}

/**
 * Enhanced job wrapper with retry, metrics, and critical alerts
 */
export function createJobExecutor(
  jobName: string,
  handler: () => Promise<void>,
  retryConfig?: Partial<RetryConfig>
) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  return async () => {
    const startTime = Date.now();

    logger.info(`=== ${jobName} STARTED ===`);
    await telegram.notifyJobStart(jobName);

    // Execute with retry
    const result = await executeWithRetry(jobName, handler, config);

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Update metrics
    updateMetrics(jobName, result.success, result.error);

    const metrics = jobMetrics.get(jobName)!;

    if (result.success) {
      logger.info({ duration, attempts: result.attempts }, `=== ${jobName} COMPLETED ===`);

      await telegram.notifyJobSuccess(jobName, duration, {
        'Tentativas': result.attempts,
        'Taxa de Sucesso': ((metrics.successCount / metrics.totalExecutions) * 100).toFixed(1) + '%'
      });

    } else {
      logger.error({
        duration,
        attempts: result.attempts,
        error: result.error
      }, `=== ${jobName} FAILED ===`);

      await telegram.notifyJobFailure(
        jobName,
        `${result.error}\n\n` +
        `🔄 Tentativas: ${result.attempts}/${config.maxRetries}\n` +
        `❌ Falhas consecutivas: ${metrics.consecutiveFailures}`
      );

      // Check for critical failures
      await checkAndAlertCriticalFailures(jobName, metrics);
    }
  };
}

/**
 * Get metrics for a specific job
 */
export function getJobMetrics(jobName: string): JobMetrics | null {
  return jobMetrics.get(jobName) || null;
}

/**
 * Get all job metrics
 */
export function getAllJobMetrics(): Map<string, JobMetrics> {
  return new Map(jobMetrics);
}

/**
 * Reset metrics for a job (useful for testing)
 */
export function resetJobMetrics(jobName: string): void {
  jobMetrics.delete(jobName);
}

/**
 * Get system health status based on job metrics
 */
export function getSystemHealth(): {
  status: 'healthy' | 'degraded' | 'critical';
  totalJobs: number;
  healthyJobs: number;
  degradedJobs: number;
  criticalJobs: number;
  details: Array<{ name: string; status: string; consecutiveFailures: number }>;
} {
  const jobs = Array.from(jobMetrics.entries());

  let healthyJobs = 0;
  let degradedJobs = 0;
  let criticalJobs = 0;

  const details = jobs.map(([name, metrics]) => {
    let status: string;

    if (metrics.consecutiveFailures === 0) {
      status = 'healthy';
      healthyJobs++;
    } else if (metrics.consecutiveFailures < CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      status = 'degraded';
      degradedJobs++;
    } else {
      status = 'critical';
      criticalJobs++;
    }

    return { name, status, consecutiveFailures: metrics.consecutiveFailures };
  });

  let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';

  if (criticalJobs >= CRITICAL_JOBS_FAILED_THRESHOLD) {
    overallStatus = 'critical';
  } else if (criticalJobs > 0 || degradedJobs > 0) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    totalJobs: jobs.length,
    healthyJobs,
    degradedJobs,
    criticalJobs,
    details
  };
}
