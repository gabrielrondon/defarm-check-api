import { FastifyInstance } from 'fastify';
import { CheckRequestSchema } from '../../types/input.js';
import { orchestratorService } from '../../services/orchestrator.js';
import { ValidationError } from '../../utils/errors.js';
import { authenticateApiKey } from '../middleware/auth.js';

export async function checkRoutes(app: FastifyInstance) {
  // POST /check - Executar nova verificação
  app.post('/check', {
    preHandler: authenticateApiKey,
    schema: {
      tags: ['check'],
      description: 'Execute compliance check',
      body: {
        type: 'object',
        required: ['input'],
        properties: {
          input: {
            type: 'object',
            required: ['type', 'value'],
            properties: {
              type: { type: 'string', enum: ['CNPJ', 'CPF', 'CAR', 'IE', 'COORDINATES', 'ADDRESS'] },
              value: { oneOf: [{ type: 'string' }, { type: 'object' }] }
            }
          },
          options: {
            type: 'object',
            properties: {
              sources: { type: 'array', items: { type: 'string' } },
              useCache: { type: 'boolean' },
              includeEvidence: { type: 'boolean' },
              timeout: { type: 'number' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            checkId: { type: 'string' },
            input: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                value: {}
              }
            },
            timestamp: { type: 'string' },
            verdict: { type: 'string' },
            score: { type: 'number' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  category: { type: 'string' },
                  status: { type: 'string' },
                  severity: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                  evidence: {
                    type: 'object',
                    properties: {
                      dataSource: { type: 'string' },
                      url: { type: 'string' },
                      lastUpdate: { type: 'string' },
                      raw: {}
                    }
                  },
                  executionTimeMs: { type: 'number' },
                  cached: { type: 'boolean' }
                }
              }
            },
            summary: {
              type: 'object',
              properties: {
                totalCheckers: { type: 'number' },
                passed: { type: 'number' },
                failed: { type: 'number' },
                warnings: { type: 'number' },
                errors: { type: 'number' },
                notApplicable: { type: 'number' }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                processingTimeMs: { type: 'number' },
                cacheHitRate: { type: 'number' },
                apiVersion: { type: 'string' },
                timestamp: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Validar com Zod
    const parsed = CheckRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.errors);
    }

    // Executar check
    const result = await orchestratorService.executeCheck(parsed.data);

    return reply.send(result);
  });

  // GET /checks/:id - Buscar check por ID
  app.get('/checks/:id', {
    schema: {
      tags: ['check'],
      description: 'Get check by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await orchestratorService.getCheckById(id);

    if (!result) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Check not found',
        statusCode: 404
      });
    }

    return reply.send(result);
  });
}
