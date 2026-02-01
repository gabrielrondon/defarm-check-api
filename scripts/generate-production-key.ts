#!/usr/bin/env tsx
/**
 * Generate production API key for defarm-core
 *
 * This script generates a production-ready API key with:
 * - High rate limit (10,000 req/min)
 * - Read + Write permissions
 * - No expiration
 *
 * Output: SQL INSERT statement ready to execute in production
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

async function generateProductionKey() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          PRODUCTION API KEY GENERATOR - DeFarm Core                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // Generate secure API key
  const rawKey = `ck_prod_defarmcore_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 12);

  console.log('Generating API key...');

  // Hash the key (this may take a few seconds)
  const keyHash = await bcrypt.hash(rawKey, 10);

  console.log('✅ API key generated successfully!\n');

  // Output the raw key (only shown once!)
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           🔑 API KEY (SAVE THIS!)                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`${rawKey}\n`);
  console.log('⚠️  IMPORTANT: Save this key now! It will NOT be shown again.\n');

  // Output SQL for insertion
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        SQL INSERT STATEMENT                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  console.log('Execute this SQL in production database:\n');

  const sql = `INSERT INTO api_keys (
    name,
    key_prefix,
    key_hash,
    is_active,
    rate_limit,
    permissions,
    created_by
) VALUES (
    'DeFarm Core - Production',
    '${keyPrefix}',
    '${keyHash}',
    true,
    10000,
    '["read", "write"]',
    'admin'
);`;

  console.log(sql);
  console.log('\n');

  // Output Railway command
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      HOW TO EXECUTE IN PRODUCTION                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  console.log('Option 1: Railway Dashboard');
  console.log('  1. Go to Railway Dashboard > PostgreSQL');
  console.log('  2. Click "Query" tab');
  console.log('  3. Paste the SQL above');
  console.log('  4. Click "Execute"\n');

  console.log('Option 2: Railway CLI');
  console.log('  railway link');
  console.log('  railway connect postgres');
  console.log('  -- Then paste the SQL above\n');

  console.log('Option 3: Copy SQL to file and execute');
  console.log('  echo "SQL_ABOVE" > /tmp/insert-key.sql');
  console.log('  railway run psql $DATABASE_URL -f /tmp/insert-key.sql\n');

  // Output usage example
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           USAGE EXAMPLE                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('cURL:');
  console.log(`curl -X POST https://defarm-check-api-production.up.railway.app/check \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${rawKey}" \\
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
\n`);

  console.log('Node.js/JavaScript:');
  console.log(`const response = await fetch('https://defarm-check-api-production.up.railway.app/check', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${rawKey}'
  },
  body: JSON.stringify({
    input: {
      type: 'CNPJ',
      value: '12345678000190'
    }
  })
});
\n`);

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         API KEY DETAILS                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`Name:        DeFarm Core - Production`);
  console.log(`Prefix:      ${keyPrefix}`);
  console.log(`Permissions: read, write`);
  console.log(`Rate Limit:  10,000 requests/minute`);
  console.log(`Expires:     Never`);
  console.log(`Created By:  admin`);
  console.log('\n');
}

generateProductionKey().catch(error => {
  console.error('Error generating key:', error);
  process.exit(1);
});
