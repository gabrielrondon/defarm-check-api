import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../../config/index.js';

export async function swaggerPlugin(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'DeFarm Check API',
        description: `
Multi-country socio-environmental compliance verification API.

**Supported Countries:**
- 🇧🇷 Brazil (CNPJ, CPF, CAR, Coordinates)
- 🇺🇾 Uruguay (RUC, CI, Coordinates)

**Features:**
- 15+ data sources (Lista Suja, IBAMA, PRODES, DETER, MapBiomas, etc)
- PostGIS spatial queries for deforestation/protected areas
- Real-time and cached results
- Comprehensive compliance scoring

**Data Sources:**
- Environmental: PRODES, DETER, MapBiomas, IBAMA, SNAP
- Social: Lista Suja MTE, CGU Sanctions
- Legal: CAR, DICOSE, Organic Producers
- Positive: MAPA Organics, ANA Water Permits
        `,
        version: config.api.version,
        contact: {
          name: 'DeFarm API Support',
          url: 'https://defarm.net'
        }
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development'
        },
        {
          url: 'https://defarm-check-api-production.up.railway.app',
          description: 'Production'
        }
      ],
      tags: [
        { name: 'check', description: 'Compliance verification operations' },
        { name: 'car', description: 'CAR (Rural Environmental Registry) endpoints' },
        { name: 'samples', description: 'Sample data for testing' },
        { name: 'sources', description: 'Data source management' },
        { name: 'health', description: 'Health and monitoring' }
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key for authentication. Contact support to obtain a key.'
          }
        },
        schemas: {
          Country: {
            type: 'string',
            enum: ['BR', 'UY'],
            description: 'ISO 3166-1 alpha-2 country code'
          },
          InputType: {
            type: 'string',
            enum: ['CNPJ', 'CPF', 'CAR', 'IE', 'RUC', 'CI', 'COORDINATES', 'ADDRESS', 'NAME'],
            description: `
Input type for compliance check:
- **CNPJ**: Brazilian company tax ID (14 digits) - Brazil only
- **CPF**: Brazilian individual tax ID (11 digits) - Brazil only
- **CAR**: Brazilian rural environmental registry - Brazil only
- **IE**: Brazilian state registration - Brazil only
- **RUC**: Uruguayan tax ID (12 digits) - Uruguay only
- **CI**: Uruguayan national ID (7-8 digits) - Uruguay only
- **COORDINATES**: Geographic coordinates (universal)
- **ADDRESS**: Physical address (universal)
- **NAME**: Company/producer name (universal)
            `
          },
          CheckInput: {
            type: 'object',
            required: ['type', 'value'],
            properties: {
              type: { $ref: '#/components/schemas/InputType' },
              value: {
                oneOf: [
                  { type: 'string', description: 'Document number or address' },
                  {
                    type: 'object',
                    required: ['lat', 'lon'],
                    properties: {
                      lat: { type: 'number', minimum: -90, maximum: 90 },
                      lon: { type: 'number', minimum: -180, maximum: 180 }
                    },
                    description: 'Coordinates for COORDINATES type'
                  }
                ]
              },
              country: {
                $ref: '#/components/schemas/Country',
                description: 'Country code (optional, auto-detected from input type)'
              }
            }
          },
          CheckRequest: {
            type: 'object',
            required: ['input'],
            properties: {
              input: { $ref: '#/components/schemas/CheckInput' },
              options: {
                type: 'object',
                properties: {
                  sources: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific sources to check (default: all applicable)',
                    example: ['Slave Labor Registry', 'SNAP Protected Areas']
                  },
                  useCache: {
                    type: 'boolean',
                    default: true,
                    description: 'Use cached results if available'
                  },
                  includeEvidence: {
                    type: 'boolean',
                    default: true,
                    description: 'Include evidence/source data in response'
                  }
                }
              }
            }
          },
          CheckResponse: {
            type: 'object',
            properties: {
              checkId: { type: 'string', format: 'uuid' },
              input: { $ref: '#/components/schemas/CheckInput' },
              timestamp: { type: 'string', format: 'date-time' },
              verdict: {
                type: 'string',
                enum: ['PASS', 'FAIL', 'WARNING', 'ERROR'],
                description: 'Overall compliance verdict'
              },
              score: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                description: 'Compliance score (0-100)'
              },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string', enum: ['environmental', 'social', 'legal', 'positive'] },
                    status: { type: 'string', enum: ['PASS', 'FAIL', 'WARNING', 'ERROR', 'NOT_APPLICABLE'] },
                    severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                    message: { type: 'string' },
                    cached: { type: 'boolean' }
                  }
                }
              },
              summary: { type: 'object' },
              metadata: {
                type: 'object',
                properties: {
                  processingTimeMs: { type: 'integer' },
                  cacheHitRate: { type: 'number' },
                  apiVersion: { type: 'string' }
                }
              }
            }
          }
        }
      },
      security: [{ ApiKeyAuth: [] }]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });
}
