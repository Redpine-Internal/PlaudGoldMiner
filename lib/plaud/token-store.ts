// Token set do Plaud persistido no Postgres (linha única id='default').
//
// Por que banco e não env/arquivo: o Plaud ROTACIONA o refresh_token a cada
// refresh (validade 24h). Qualquer cópia estática (Secret Manager, env, arquivo)
// fica inválida no primeiro refresh feito por outra instância. Cloud Run com
// min-instances=0 reinicia com frequência, então o estado precisa ser central.
//
// Single-flight: o refresh roda dentro de uma transação com
// `SELECT ... FOR UPDATE` na linha do token. Instâncias concorrentes bloqueiam
// no lock; ao acordar, re-checam a expiração — se outra instância já renovou,
// usam o token novo sem chamar o Plaud (evita dupla rotação, que invalidaria
// o refresh_token recém-gravado).

import { pool } from '@/lib/db';
import { PlaudAuthError } from '@/lib/plaud/tokens';

const REFRESH_URL =
  process.env.PLAUD_REFRESH_URL ||
  'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh';
const EXPIRY_SKEW_MS = 60_000;

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

type RefreshFn = (refreshToken: string) => Promise<RefreshResponse>;

async function realRefresh(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PlaudAuthError(`Falha ao renovar o token do Plaud (${res.status}). ${body.slice(0, 200)}`);
  }
  return (await res.json()) as RefreshResponse;
}

let refreshFn: RefreshFn = realRefresh;

// Cache em memória por processo, apenas para evitar 1 SELECT por request.
let cached: { accessToken: string; expiresAt: number | null } | null = null;

function isFresh(expiresAt: number | null): boolean {
  return expiresAt === null || Date.now() < expiresAt - EXPIRY_SKEW_MS;
}

/** Access token válido, renovando (com lock) se expirado. Lança PlaudAuthError. */
export async function getStoredAccessToken(): Promise<string> {
  if (cached && cached.accessToken && isFresh(cached.expiresAt)) return cached.accessToken;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sel = await client.query(
      `SELECT access_token, refresh_token, expires_at
         FROM app_plaud_tokens WHERE id='default' FOR UPDATE`
    );
    if (sel.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new PlaudAuthError(
        'Nenhum token do Plaud no banco (app_plaud_tokens). Rode scripts/seed-plaud-tokens.mts após autenticar o MCP do Plaud.'
      );
    }
    const row = sel.rows[0] as { access_token: string; refresh_token: string; expires_at: Date | null };
    const expMs = row.expires_at ? new Date(row.expires_at).getTime() : null;

    // Re-check pós-lock: outra instância pode ter renovado enquanto esperávamos.
    if (row.access_token && isFresh(expMs)) {
      await client.query('COMMIT');
      cached = { accessToken: row.access_token, expiresAt: expMs };
      return row.access_token;
    }

    if (!row.refresh_token) {
      await client.query('ROLLBACK');
      throw new PlaudAuthError('Token do Plaud expirado e sem refresh_token no banco. Re-semeie via scripts/seed-plaud-tokens.mts.');
    }

    const data = await refreshFn(row.refresh_token);
    const nextExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    await client.query(
      `UPDATE app_plaud_tokens
          SET access_token=$1, refresh_token=$2, token_type=$3, expires_at=$4, updated_at=now()
        WHERE id='default'`,
      [data.access_token, data.refresh_token ?? row.refresh_token, data.token_type ?? 'Bearer', nextExpiresAt]
    );
    await client.query('COMMIT');
    cached = { accessToken: data.access_token, expiresAt: nextExpiresAt ? nextExpiresAt.getTime() : null };
    return data.access_token;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* já commitado/rollbackado */ }
    if (e instanceof PlaudAuthError) throw e;
    throw new PlaudAuthError('Erro ao obter token do Plaud no banco.', e);
  } finally {
    client.release();
  }
}

/** Grava um token set completo (usado pelo seed). */
export async function saveTokenSet(set: { accessToken: string; refreshToken: string; tokenType?: string; expiresAt?: Date | null }): Promise<void> {
  await pool.query(
    `INSERT INTO app_plaud_tokens (id, access_token, refresh_token, token_type, expires_at)
     VALUES ('default', $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET access_token=$1, refresh_token=$2, token_type=$3, expires_at=$4, updated_at=now()`,
    [set.accessToken, set.refreshToken, set.tokenType ?? 'Bearer', set.expiresAt ?? null]
  );
  cached = null;
}

// Só para scripts de verificação (injeção do refresh + limpeza de cache).
export const __testing = {
  setRefreshFn(fn: RefreshFn) { refreshFn = fn; },
  clearCache() { cached = null; },
};
