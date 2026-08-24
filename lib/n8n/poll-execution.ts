// Orquestração de execução assíncrona de agentes n8n (Fase B — pré-req das Fases C–D).
//
// Padrão: POST no webhook do agente devolve um handle com `executionId`; o resultado
// real chega depois. Este helper dispara o agente e faz polling no webhook 06
// (execution-status) com backoff + timeout até `completed`/`error`.
//
// Construído sobre callWebhook/getExecutionStatus (client.ts) — não fala com Postgres.
// Nada aqui muda comportamento existente enquanto as rotas não o consumirem.

import { callWebhook, getExecutionStatus } from './client';
import type { N8nWebhookId, N8nResult, N8nExecutionStatus } from './types';

export interface RunAgentOptions {
  /** Tempo total máximo de espera pelo resultado (ms). Default 120s. */
  timeoutMs?: number;
  /** Intervalo inicial entre polls (ms). Default 1s. */
  initialDelayMs?: number;
  /** Intervalo máximo entre polls após backoff (ms). Default 8s. */
  maxDelayMs?: number;
  /** Fator de crescimento do backoff. Default 1.5. */
  backoffFactor?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    }, { once: true });
  });

/** Extrai o executionId de um payload de disparo, tolerante a variações de formato. */
function extractExecutionId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const candidate =
    o.executionId ?? o.execution_id ?? o.id ??
    (o.data && typeof o.data === 'object'
      ? (o.data as Record<string, unknown>).executionId
      : undefined);
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/**
 * Dispara um agente n8n e aguarda (via polling do webhook 06) o resultado final.
 * Resolve com o `N8nExecutionStatus` quando `completed`/`error`, ou com erro em
 * timeout / falha de rede / abort.
 */
export async function runAgent(
  id: N8nWebhookId,
  payload: unknown,
  opts: RunAgentOptions = {}
): Promise<N8nResult<N8nExecutionStatus>> {
  const {
    timeoutMs = 120_000,
    initialDelayMs = 1_000,
    maxDelayMs = 8_000,
    backoffFactor = 1.5,
    signal,
  } = opts;

  const started = performance.now();
  const dispatch = await callWebhook(id, payload, { timeoutMs: 20_000, signal });
  if (!dispatch.ok) return dispatch;

  const executionId = extractExecutionId(dispatch.data);
  if (!executionId) {
    return { ok: false, error: `n8n ${id}: resposta sem executionId (agente síncrono ou formato inesperado)` };
  }

  let delay = initialDelayMs;
  while (performance.now() - started < timeoutMs) {
    await sleep(delay, signal);
    const status = await getExecutionStatus(executionId);
    if (!status.ok) return status;

    const s = status.data.status;
    if (s === 'completed' || s === 'error') return status;

    delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
  }

  return { ok: false, error: `n8n ${id}: timeout após ${timeoutMs}ms (executionId=${executionId})` };
}
