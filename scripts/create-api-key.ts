import { db } from '../src/db/client.js';
import { apiKeys } from '../src/db/schema.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '../src/utils/logger.js';

interface CreateApiKeyOptions {
  name: string;
  rateLimit?: number;
  permissions?: string[];
  expiresInDays?: number;
  createdBy?: string;
}

async function createApiKey(options: CreateApiKeyOptions) {
  const {
    name,
    rateLimit = 100,
    permissions = ['read'],
    expiresInDays,
    createdBy
  } = options;

  try {
    // Gerar API key aleatória (32 bytes = 64 chars hex)
    const apiKey = `ck_${crypto.randomBytes(32).toString('hex')}`;

    // Extrair prefix (primeiros 12 chars após "ck_") para busca rápida
    const keyPrefix = apiKey.substring(3, 15);

    // Hash da key com bcrypt
    const saltRounds = 10;
    const keyHash = await bcrypt.hash(apiKey, saltRounds);

    // Calcular data de expiração se especificada
    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Inserir no banco
    const result = await db.insert(apiKeys).values({
      name,
      keyPrefix,
      keyHash,
      rateLimit,
      permissions,
      expiresAt,
      createdBy: createdBy || 'cli'
    }).returning();

    const key = result[0];

    logger.info({
      id: key.id,
      name: key.name,
      rateLimit: key.rateLimit,
      permissions: key.permissions,
      expiresAt: key.expiresAt
    }, 'API key created successfully');

    console.log('\n' + '='.repeat(80));
    console.log('🔑 API KEY CREATED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('');
    console.log('Name:        ', name);
    console.log('ID:          ', key.id);
    console.log('Rate Limit:  ', rateLimit, 'req/min');
    console.log('Permissions: ', permissions.join(', '));
    if (expiresAt) {
      console.log('Expires:     ', expiresAt.toISOString());
    }
    console.log('');
    console.log('⚠️  IMPORTANT: Save this API key securely. It will not be shown again!');
    console.log('');
    console.log('API Key:');
    console.log('');
    console.log('  ' + apiKey);
    console.log('');
    console.log('Usage:');
    console.log('');
    console.log('  curl -X POST https://your-api.com/check \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log(`    -H "X-API-Key: ${apiKey}" \\`);
    console.log('    -d \'{"input":{"type":"CNPJ","value":"12345678000190"}}\'');
    console.log('');
    console.log('='.repeat(80));
    console.log('');

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Failed to create API key');
    process.exit(1);
  }
}

// Parse argumentos da linha de comando
const args = process.argv.slice(2);
const options: CreateApiKeyOptions = {
  name: 'Unnamed Key'
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--name' || arg === '-n') {
    options.name = args[++i];
  } else if (arg === '--rate-limit' || arg === '-r') {
    options.rateLimit = parseInt(args[++i], 10);
  } else if (arg === '--permissions' || arg === '-p') {
    options.permissions = args[++i].split(',');
  } else if (arg === '--expires' || arg === '-e') {
    options.expiresInDays = parseInt(args[++i], 10);
  } else if (arg === '--created-by' || arg === '-c') {
    options.createdBy = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: npm run create-api-key -- [options]

Options:
  -n, --name <name>              Name/description of the API key (required)
  -r, --rate-limit <number>      Rate limit (requests per minute, default: 100)
  -p, --permissions <perms>      Comma-separated permissions (default: read)
  -e, --expires <days>           Expiration in days (optional)
  -c, --created-by <email>       Creator email (optional)
  -h, --help                     Show this help

Examples:
  npm run create-api-key -- --name "defarm-core production" --rate-limit 1000
  npm run create-api-key -- -n "Test Key" -r 50 -p "read,write" -e 30
    `);
    process.exit(0);
  }
}

createApiKey(options);
