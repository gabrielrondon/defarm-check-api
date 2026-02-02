/**
 * Test Setup
 *
 * Configures test environment before running tests
 */

import { config } from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables from .env
config();

// Set test environment
process.env.NODE_ENV = 'test';

// Reduce log noise during tests (optional)
logger.level = 'error';

// Set test API key if not provided
if (!process.env.TEST_API_KEY) {
  console.warn('WARNING: TEST_API_KEY not set. Using default test key.');
  console.warn('Set TEST_API_KEY in .env file for production-like testing.');
  process.env.TEST_API_KEY = 'test-key-12345';
}

// Verify required environment variables
const requiredVars = ['DATABASE_URL'];
const missingVars = requiredVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Tests will likely fail. Check your .env file.');
}

// Increase timeout for integration tests (geocoding, PostGIS queries)
if (process.env.CI) {
  console.log('Running in CI environment - using extended timeouts');
}

console.log('✓ Test environment configured');
console.log(`  - DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
console.log(`  - REDIS_URL: ${process.env.REDIS_URL ? 'SET' : 'NOT SET'}`);
console.log(`  - CACHE_ENABLED: ${process.env.CACHE_ENABLED || 'true'}`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
