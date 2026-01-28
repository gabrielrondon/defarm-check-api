import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Pool de conexões PostgreSQL
const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Drizzle instance
export const db = drizzle(pool, { schema });

// Test connection
pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Database connection error');
});

// Graceful shutdown
export async function closeDatabase() {
  await pool.end();
  logger.info('Database connection closed');
}
