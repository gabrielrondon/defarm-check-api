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
      summary: 'Execute compliance check',
      description: `Run a socio-environmental compliance verification against all applicable data sources.

**Brazil examples:**
- CNPJ: \`{"input":{"type":"CNPJ","value":"12345678000190"}}\`
- CPF: \`{"input":{"type":"CPF","value":"12345678901"}}\`
- CAR: \`{"input":{"type":"CAR","value":"MT-5100250-XXXXXXXXXXXXXXXX"}}\`
- Coordinates: \`{"input":{"type":"COORDINATES","value":{"lat":-9.3748,"lon":-68.2104}}}\`

**Uruguay examples:**
- RUC: \`{"input":{"type":"RUC","value":"210000000001","country":"UY"}}\`
- CI: \`{"input":{"type":"CI","value":"12345678","country":"UY"}}\`
- Coordinates: \`{"input":{"type":"COORDINATES","value":{"lat":-34.4711,"lon":-56.1945},"country":"UY"}}\`

**Verdicts:**
- \`PASS\` (score 80-100): No violations found
- \`WARNING\` (score 50-79): Minor issues or data gaps
- \`FAIL\` (score 0-49): Violations detected
- \`ERROR\`: Check failed to execute`,
      body: {
        type: 'object',
        required: ['input'],
        properties: {
          input: {
            type: 'object',
            required: ['type', 'value'],
            properties: {
              type: { type: 'string', enum: ['CNPJ', 'CPF', 'CAR', 'IE', 'RUC', 'CI', 'CUIT', 'CUIL', 'RUC_PY', 'CI_PY', 'NIT_BO', 'CI_BO', 'RUT', 'NIT_CO', 'CC_CO', 'RUC_PE', 'DNI_PE', 'COORDINATES', 'ADDRESS', 'NAME'] },
              value: { oneOf: [{ type: 'string' }, { type: 'object' }] },
              country: { type: 'string', enum: ['BR', 'UY', 'AR', 'PY', 'BO', 'CL', 'CO', 'PE'] }
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
                  sourceType: { type: 'string', enum: ['direct', 'derived'] },
                  status: { type: 'string' },
                  severity: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                  indicators: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        value: {},
                        unit: { type: 'string' },
                        direction: { type: 'string', enum: ['HIGHER_IS_WORSE', 'LOWER_IS_WORSE', 'NEUTRAL'] },
                        confidence: { type: 'number' },
                        source: { type: 'string' }
                      }
                    }
                  },
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
            insights: {
              type: 'object',
              properties: {
                l2: {
                  type: 'object',
                  properties: {
                    version: { type: 'string' },
                    dimensions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          label: { type: 'string' },
                          score: { type: 'number' },
                          weight: { type: 'number' },
                          rationale: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                l3: {
                  type: 'object',
                  properties: {
                    version: { type: 'string' },
                    signals: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          label: { type: 'string' },
                          value: {},
                          horizon: { type: 'string', enum: ['7d', '30d', '90d'] },
                          confidence: { type: 'number' }
                        }
                      }
                    }
                  }
                }
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
      summary: 'Get check result by ID',
      description: 'Retrieve a previously executed compliance check result by its UUID. Check results are persisted after each `POST /check` call.',
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
