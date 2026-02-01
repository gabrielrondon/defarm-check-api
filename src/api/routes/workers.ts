import { FastifyInstance } from 'fastify';
import { getAllJobMetrics, getSystemHealth } from '../../worker/job-executor.js';

export async function workerRoutes(app: FastifyInstance) {
  /**
   * Get worker system health status
   */
  app.get('/workers/health', {
    schema: {
      tags: ['workers'],
      description: 'Get worker system health status and job metrics'
    }
  }, async (request, reply) => {
    const systemHealth = getSystemHealth();
    const allMetrics = getAllJobMetrics();

    const metrics = Array.from(allMetrics.entries()).map(([name, m]) => ({
      name,
      totalExecutions: m.totalExecutions,
      successCount: m.successCount,
      failureCount: m.failureCount,
      consecutiveFailures: m.consecutiveFailures,
      successRate: m.totalExecutions > 0
        ? ((m.successCount / m.totalExecutions) * 100).toFixed(1) + '%'
        : 'N/A',
      lastSuccess: m.lastSuccess?.toISOString() || null,
      lastFailure: m.lastFailure?.toISOString() || null,
      lastError: m.lastError
    }));

    return {
      systemHealth: {
        status: systemHealth.status,
        totalJobs: systemHealth.totalJobs,
        healthyJobs: systemHealth.healthyJobs,
        degradedJobs: systemHealth.degradedJobs,
        criticalJobs: systemHealth.criticalJobs
      },
      jobs: metrics,
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Get metrics for a specific job
   */
  app.get('/workers/jobs/:jobName', {
    schema: {
      tags: ['workers'],
      description: 'Get metrics for a specific job',
      params: {
        type: 'object',
        properties: {
          jobName: { type: 'string' }
        },
        required: ['jobName']
      }
    }
  }, async (request, reply) => {
    const { jobName } = request.params as { jobName: string };
    const allMetrics = getAllJobMetrics();

    // Find job (case-insensitive)
    const metrics = Array.from(allMetrics.entries()).find(
      ([name]) => name.toLowerCase() === jobName.toLowerCase()
    );

    if (!metrics) {
      return reply.status(404).send({
        error: 'Job not found',
        availableJobs: Array.from(allMetrics.keys())
      });
    }

    const [name, m] = metrics;

    return {
      name,
      totalExecutions: m.totalExecutions,
      successCount: m.successCount,
      failureCount: m.failureCount,
      consecutiveFailures: m.consecutiveFailures,
      successRate: m.totalExecutions > 0
        ? ((m.successCount / m.totalExecutions) * 100).toFixed(1) + '%'
        : 'N/A',
      lastSuccess: m.lastSuccess?.toISOString() || null,
      lastFailure: m.lastFailure?.toISOString() || null,
      lastError: m.lastError,
      timestamp: new Date().toISOString()
    };
  });
}
