// Typed client for the n8n I/O boundary (Fase A — connection layer, non-breaking).
// ehs-insights never talks to Postgres directly; everything goes through these webhooks.
//
// Auth: confirmed by inspecting the `Validate` node of workflows 02–07 — they check
// `headers['x-plaude-api-key']` against a fixed 64-char key. Webhook 01 (process-meeting)
// has NO auth. So we send the secret as `x-plaude-api-key`; harmless for 01.

import {
  N8N_WEBHOOKS,
  type N8nWebhookId,
  type N8nResult,
  type N8nExecutionStatus,
} from './types';

export const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n-prd.mychatbot.us';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || '';

export function isN8nConfigured(): boolean {
  return Boolean(N8N_BASE_URL && N8N_WEBHOOK_SECRET);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (N8N_WEBHOOK_SECRET) {
    // Scheme enforced by the Plaude webhooks' `Validate` node.
    h['x-plaude-api-key'] = N8N_WEBHOOK_SECRET;
  }
  return h;
}

function webhookUrl(id: N8nWebhookId): string {
  return `${N8N_BASE_URL.replace(/\/$/, '')}${N8N_WEBHOOKS[id]}`;
}

/** POST a payload to a Plaude webhook and return a typed result. */
export async function callWebhook<T = unknown>(
  id: N8nWebhookId,
  payload: unknown,
  init?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<N8nResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20_000);
  if (init?.signal) init.signal.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(webhookUrl(id), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `n8n ${id} responded ${res.status}`, status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `n8n ${id} request failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Poll webhook 06 for the status of an async agent execution (Fase B helper). */
export async function getExecutionStatus(executionId: string): Promise<N8nResult<N8nExecutionStatus>> {
  return callWebhook<N8nExecutionStatus>('execution-status', { executionId });
}

export interface N8nHealth {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  status?: number;
  error?: string;
  /** Auth do webhook validada (Fase A). undefined = não testada / n8n inalcançável. */
  authOk?: boolean;
}

/**
 * Valida que o `x-plaude-api-key` é aceito pelos webhooks (Fase A).
 * Faz um POST autenticado ao webhook 06 (execution-status) — idempotente e só-leitura,
 * o candidato mais seguro. Interpreta 401/403 como auth reprovada; qualquer outra
 * resposta HTTP (incl. 4xx de negócio por executionId inexistente) prova que a chave
 * passou pelo nó `Validate`. Erro de rede => indeterminado (undefined).
 */
export async function pingWebhookAuth(): Promise<{ authOk?: boolean; status?: number; error?: string }> {
  if (!isN8nConfigured()) return { authOk: false, error: 'n8n not configured' };
  const res = await callWebhook('execution-status', { executionId: '__auth_probe__' }, { timeoutMs: 8_000 });
  if (res.ok) return { authOk: true };
  // callWebhook devolve `status` só em respostas HTTP não-2xx; ausência = erro de rede.
  if (typeof res.status === 'number') {
    return { authOk: res.status !== 401 && res.status !== 403, status: res.status };
  }
  return { authOk: undefined, error: res.error };
}

/**
 * Lightweight reachability check for the settings UI. A HEAD/GET to the base URL
 * proves the instance is up; a network error means offline. This does NOT validate
 * webhook auth (webhooks are POST-only) — it only reports whether n8n is reachable.
 */
export async function pingN8n(): Promise<N8nHealth> {
  const base = { configured: isN8nConfigured(), baseUrl: N8N_BASE_URL };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(N8N_BASE_URL.replace(/\/$/, ''), {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
    });
    // Any HTTP response (even 401/404) means the host is reachable.
    return { ...base, reachable: true, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...base, reachable: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}
