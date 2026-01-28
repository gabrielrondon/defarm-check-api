import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../../config/index.js';

export async function swaggerPlugin(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Check API',
        description: 'API de compliance socioambiental DeFarm',
        version: config.api.version
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development'
        }
      ],
      tags: [
        { name: 'check', description: 'Check operations' },
        { name: 'sources', description: 'Source management' },
        { name: 'health', description: 'Health checks' }
      ]
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
