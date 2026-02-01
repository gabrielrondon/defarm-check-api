#!/usr/bin/env tsx
/**
 * Create test API key for E2E testing
 * Usage: railway run --service defarm-check-api tsx scripts/create-test-api-key.ts
 */

import { db } from '../src/db/client.js';
import { apiKeys } from '../src/db/schema.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '../src/utils/logger.js';

async function createTestApiKey() {
  try {
    // Generate API key
    const rawKey = `ck_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12);

    // Hash the key
    const keyHash = await bcrypt.hash(rawKey, 10);

    // Insert into database
    const [apiKey] = await db.insert(apiKeys).values({
      name: 'E2E Test Key (Auto-generated)',
      keyPrefix,
      keyHash,
      isActive: true,
      rateLimit: 1000,
      permissions: ['read'],
      createdBy: 'auto-script'
    }).returning();

    logger.info({ id: apiKey.id }, 'API key created successfully');

    console.log('\n================================================================================');
    console.log('API KEY CREATED SUCCESSFULLY');
    console.log('================================================================================');
    console.log(`\nKEY: ${rawKey}`);
    console.log(`\nTo use in tests:`);
    console.log(`  export API_KEY="${rawKey}"`);
    console.log(`  npm run test:e2e`);
    console.log('\n================================================================================\n');

    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create API key');
    process.exit(1);
  }
}

createTestApiKey();
