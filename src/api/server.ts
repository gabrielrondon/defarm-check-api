import Fastify from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { securityPlugin } from './plugins/security.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { healthRoutes } from './routes/health.js';
import { checkRoutes } from './routes/check.js';
import { sourcesRoutes } from './routes/sources.js';
import samplesRoutes from './routes/samples.js';
import { workerRoutes } from './routes/workers.js';
import carRoutes from './routes/car.js';

export async function createServer() {
  const app = Fastify({
    logger: logger as any,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId'
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Plugins
  await securityPlugin(app);
  await swaggerPlugin(app);

  // Routes
  await app.register(healthRoutes);
  await app.register(checkRoutes);
  await app.register(sourcesRoutes);
  await app.register(samplesRoutes);
  await app.register(workerRoutes);
  await app.register(carRoutes);

  // Root endpoint
  app.get('/', async () => {
    return {
      name: 'Check API',
      version: config.api.version,
      description: 'DeFarm Compliance Socioambiental API',
      docs: '/docs',
      endpoints: {
        health: '/health',
        check: 'POST /check',
        sources: '/sources',
        samples: '/samples/*',
        workers: '/workers/health',
        car: {
          single: 'GET /car/:carNumber',
          geojson: 'GET /car/:carNumber/geojson',
          batch: 'POST /car/batch'
        }
      }
    };
  });

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host
    });

    logger.info(
      `Server listening on http://${config.server.host}:${config.server.port}`
    );
    logger.info(`Docs available at http://${config.server.host}:${config.server.port}/docs`);

    return app;
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}
