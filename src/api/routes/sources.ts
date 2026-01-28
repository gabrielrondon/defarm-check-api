import { FastifyInstance } from 'fastify';
import { checkerRegistry } from '../../checkers/index.js';
import { SourceStatus } from '../../types/api.js';

export async function sourcesRoutes(app: FastifyInstance) {
  // GET /sources - Listar todas as fontes
  app.get('/sources', {
    schema: {
      tags: ['sources'],
      description: 'List all checker sources',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              enabled: { type: 'boolean' },
              status: { type: 'string' },
              description: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const checkers = checkerRegistry.getAll();

    const sources: SourceStatus[] = checkers.map(checker => ({
      name: checker.metadata.name,
      category: checker.metadata.category,
      enabled: checker.config.enabled,
      status: checker.config.enabled ? 'operational' : 'down',
      description: checker.metadata.description
    }));

    return reply.send(sources);
  });

  // GET /sources/:category - Listar fontes por categoria
  app.get('/sources/:category', {
    schema: {
      tags: ['sources'],
      description: 'List sources by category',
      params: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['environmental', 'social', 'legal'] }
        }
      }
    }
  }, async (request, reply) => {
    const { category } = request.params as { category: string };

    const checkers = checkerRegistry.getByCategory(category);

    const sources: SourceStatus[] = checkers.map(checker => ({
      name: checker.metadata.name,
      category: checker.metadata.category,
      enabled: checker.config.enabled,
      status: checker.config.enabled ? 'operational' : 'down',
      description: checker.metadata.description
    }));

    return reply.send(sources);
  });
}
