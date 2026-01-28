import { startServer } from './api/server.js';
import { logger } from './utils/logger.js';
import { closeDatabase } from './db/client.js';
import { cacheService } from './services/cache.js';
import './checkers/index.js'; // Initialize checkers

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');

  try {
    await closeDatabase();
    await cacheService.close();
    logger.info('All connections closed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
startServer().catch(err => {
  logger.error({ err }, 'Failed to start application');
  process.exit(1);
});
