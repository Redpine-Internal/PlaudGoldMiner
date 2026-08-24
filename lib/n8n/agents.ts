// Camada de disparo dos agentes n8n (Fase 4).
// Responsabilidade única: montar o payload e chamar o webhook correspondente.
// Sem acesso a banco de dados nem validações de negócio — isso fica nas rotas HTTP.

import { callWebhook } from './client';
import type { N8nWebhookId, N8nResult } from './types';

// Lido no carregamento do módulo; pode ser sobrescrito via variável de ambiente.
const N8N_DEFAULT_USER_ID = process.env.N8N_DEFAULT_USER_ID || '';

/** Retorna o user_id padrão configurado no ambiente. */
export function getDefaultUserId(): string {
  return N8N_DEFAULT_USER_ID;
}

// ---------------------------------------------------------------------------
// Injeção de dependência — permite testar sem atingir a rede.
// ---------------------------------------------------------------------------

export interface AgentDeps {
  callWebhook: typeof callWebhook;
}

const prodDeps: AgentDeps = { callWebhook };

// ---------------------------------------------------------------------------
// Opções opcionais por agente (campos extras exigidos pelo contrato n8n).
// ---------------------------------------------------------------------------

export interface BusinessOpts {
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

export interface ArticleOpts {
  focusArea?: string;
}

export interface SocialOpts {
  platforms?: string[];
  contentTypes?: string[];
  tone?: string;
}

// ---------------------------------------------------------------------------
// Funções de disparo
// ---------------------------------------------------------------------------

/** Dispara o agente de oportunidades de negócio (webhook 02). */
export async function triggerBusiness(
  meetingIds: string[],
  opts?: BusinessOpts,
  deps: AgentDeps = prodDeps,
): Promise<N8nResult<unknown>> {
  const payload: Record<string, unknown> = {
    user_id: N8N_DEFAULT_USER_ID,
    meeting_ids: meetingIds,
  };
  if (opts?.dateRangeStart !== undefined) payload.date_range_start = opts.dateRangeStart;
  if (opts?.dateRangeEnd !== undefined) payload.date_range_end = opts.dateRangeEnd;

  return deps.callWebhook('business-opportunities' as N8nWebhookId, payload);
}

/** Dispara o agente de insights para artigos (webhook 04). */
export async function triggerArticle(
  meetingIds: string[],
  opts?: ArticleOpts,
  deps: AgentDeps = prodDeps,
): Promise<N8nResult<unknown>> {
  const payload: Record<string, unknown> = {
    user_id: N8N_DEFAULT_USER_ID,
    meeting_ids: meetingIds,
  };
  if (opts?.focusArea !== undefined) payload.focus_area = opts.focusArea;

  return deps.callWebhook('article-insights' as N8nWebhookId, payload);
}

/** Dispara o agente de conteúdo para redes sociais (webhook 05). */
export async function triggerSocial(
  meetingIds: string[],
  opts?: SocialOpts,
  deps: AgentDeps = prodDeps,
): Promise<N8nResult<unknown>> {
  const payload: Record<string, unknown> = {
    user_id: N8N_DEFAULT_USER_ID,
    meeting_ids: meetingIds,
  };
  if (opts?.platforms !== undefined) payload.platforms = opts.platforms;
  if (opts?.contentTypes !== undefined) payload.content_types = opts.contentTypes;
  if (opts?.tone !== undefined) payload.tone = opts.tone;

  return deps.callWebhook('social-content' as N8nWebhookId, payload);
}
