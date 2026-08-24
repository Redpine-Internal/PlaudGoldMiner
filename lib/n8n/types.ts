// Request/response contracts for the 7 Plaude webhooks (n8n I/O boundary).
// Fase A: shapes are derived from the plan; refine against the Validate/Parse nodes
// as each webhook is actually migrated (Fases C–E).

export type N8nWebhookId =
  | 'process-meeting' // 01
  | 'business-opportunities' // 02
  | 'embedding-compare' // 03
  | 'article-insights' // 04
  | 'social-content' // 05
  | 'execution-status' // 06
  | 'embedding-approve'; // 07

/** Relative paths on N8N_BASE_URL. */
export const N8N_WEBHOOKS: Record<N8nWebhookId, string> = {
  'process-meeting': '/webhook/4197f28e-25f3-4334-9fb0-2ea9ba58599e',
  'business-opportunities': '/webhook/plaude-business-opportunities',
  'embedding-compare': '/webhook/plaude-embedding-compare',
  'article-insights': '/webhook/plaude-article-insights',
  'social-content': '/webhook/plaude-social-content',
  'execution-status': '/webhook/plaude-execution-status',
  'embedding-approve': '/webhook/plaude-embedding-approve',
};

/** Agents respond async; the initial POST returns an execution handle (Fase B). */
export interface N8nExecutionHandle {
  executionId: string;
  status?: 'queued' | 'running' | 'completed' | 'error';
}

/** Polling response from webhook 06. */
export interface N8nExecutionStatus {
  executionId: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  result?: unknown;
  error?: string | null;
}

export interface N8nError {
  ok: false;
  error: string;
  status?: number;
}

export interface N8nOk<T> {
  ok: true;
  data: T;
}

export type N8nResult<T> = N8nOk<T> | N8nError;
