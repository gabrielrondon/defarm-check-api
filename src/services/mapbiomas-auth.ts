/**
 * MapBiomas Alerta Authentication Service
 *
 * Gerencia autenticação com a API GraphQL do MapBiomas Alerta.
 * Faz signIn com email/senha e caches o bearer token em memória.
 *
 * Endpoint: https://plataforma.alerta.mapbiomas.org/api/v2/graphql
 * Auth: signIn mutation → bearer token (cada signIn invalida o anterior)
 *
 * Env vars:
 *   MAPBIOMAS_EMAIL    — email da conta MapBiomas
 *   MAPBIOMAS_PASSWORD — senha da conta MapBiomas
 */

import { logger } from '../utils/logger.js';

const GRAPHQL_ENDPOINT = 'https://plataforma.alerta.mapbiomas.org/api/v2/graphql';

// In-memory token cache (one per process lifetime)
let cachedToken: string | null = null;
let tokenFetchedAt: number     = 0;
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes (tokens valid ~1h)

const SIGN_IN_MUTATION = `
  mutation SignIn($email: String!, $password: String!) {
    signIn(email: $email, password: $password) {
      token
    }
  }
`;

export async function getMapBiomasToken(): Promise<string> {
  const email    = process.env.MAPBIOMAS_EMAIL;
  const password = process.env.MAPBIOMAS_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'MapBiomas credentials not configured. Set MAPBIOMAS_EMAIL and MAPBIOMAS_PASSWORD.'
    );
  }

  // Return cached token if still fresh
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  logger.debug('Authenticating with MapBiomas Alerta API...');

  const resp = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: SIGN_IN_MUTATION,
      variables: { email, password }
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!resp.ok) {
    throw new Error(`MapBiomas signIn HTTP error: ${resp.status}`);
  }

  const body = (await resp.json()) as {
    data?: { signIn?: { token: string } };
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(`MapBiomas signIn error: ${body.errors[0].message}`);
  }

  const token = body.data?.signIn?.token;
  if (!token) {
    throw new Error('MapBiomas signIn returned no token');
  }

  cachedToken    = token;
  tokenFetchedAt = Date.now();

  logger.debug('MapBiomas authentication successful');
  return token;
}

/**
 * Execute a GraphQL query against MapBiomas Alerta API.
 * Handles auth automatically (gets/refreshes token).
 * On 401, clears cache and retries once.
 */
export async function mapBiomasQuery<T = any>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const execute = async (token: string): Promise<Response> =>
    fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${token}`
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(12000)
    });

  let token = await getMapBiomasToken();
  let resp  = await execute(token);

  // On 401, invalidate cache and retry once
  if (resp.status === 401) {
    cachedToken = null;
    token       = await getMapBiomasToken();
    resp        = await execute(token);
  }

  if (!resp.ok) {
    throw new Error(`MapBiomas API HTTP error: ${resp.status}`);
  }

  const body = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (body.errors?.length) {
    throw new Error(`MapBiomas GraphQL error: ${body.errors[0].message}`);
  }

  return body.data as T;
}

export function mapBiomasConfigured(): boolean {
  return Boolean(process.env.MAPBIOMAS_EMAIL && process.env.MAPBIOMAS_PASSWORD);
}
