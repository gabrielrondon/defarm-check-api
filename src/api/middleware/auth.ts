import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db/client.js';
import { apiKeys } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { logger } from '../../utils/logger.js';

// Extend FastifyRequest to include apiKey
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: {
      id: string;
      name: string;
      permissions: string[];
      rateLimit: number;
    };
  }
}

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing API key. Include X-API-Key header.',
      statusCode: 401
    });
  }

  try {
    // Extrair prefix da API key (primeiros 12 chars após "ck_")
    // Formato esperado: ck_XXXXXXXXXXXX...
    const keyPrefix = apiKey.substring(3, 15); // Pega 12 chars depois de "ck_"

    // Buscar key pelo prefix (busca rápida no índice)
    const keys = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.isActive, true),
        eq(apiKeys.keyPrefix, keyPrefix)
      ))
      .limit(1);

    if (keys.length === 0) {
      logger.warn({ apiKey: apiKey.substring(0, 10) + '...' }, 'Invalid API key attempt');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
        statusCode: 401
      });
    }

    // Verificar hash completo com bcrypt (apenas 1 comparação)
    const key = keys[0];
    const isValid = await bcrypt.compare(apiKey, key.keyHash);

    if (!isValid) {
      logger.warn({ keyId: key.id }, 'API key hash mismatch');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
        statusCode: 401
      });
    }

    const matchedKey = key;

    // Verificar expiração
    if (matchedKey.expiresAt && new Date(matchedKey.expiresAt) < new Date()) {
      logger.warn({ keyId: matchedKey.id }, 'Expired API key attempt');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'API key has expired',
        statusCode: 401
      });
    }

    // Atualizar last_used_at (async, não bloqueia request)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, matchedKey.id))
      .execute()
      .catch(err => logger.error({ err }, 'Failed to update last_used_at'));

    // Adicionar info da API key ao request
    request.apiKey = {
      id: matchedKey.id,
      name: matchedKey.name,
      permissions: (matchedKey.permissions as string[]) || ['read'],
      rateLimit: matchedKey.rateLimit
    };

    logger.debug({ keyName: matchedKey.name }, 'API key authenticated');
  } catch (err) {
    logger.error({ err }, 'Authentication error');
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      statusCode: 500
    });
  }
}

// Middleware para verificar permissões
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401
      });
    }

    if (!request.apiKey.permissions.includes(permission) && !request.apiKey.permissions.includes('admin')) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Missing required permission: ${permission}`,
        statusCode: 403
      });
    }
  };
}
