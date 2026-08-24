// Rota dinâmica POST /api/agents/[agent]
// Valida o corpo da requisição e despacha para o agente n8n correspondente.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getDefaultUserId,
  triggerBusiness,
  triggerArticle,
  triggerSocial,
  type BusinessOpts,
  type ArticleOpts,
  type SocialOpts,
} from '@/lib/n8n/agents';
import type { N8nResult } from '@/lib/n8n/types';

// ---------------------------------------------------------------------------
// Agentes suportados
// ---------------------------------------------------------------------------

const AGENTS = ['business', 'article', 'social'] as const;
type AgentName = (typeof AGENTS)[number];

// ---------------------------------------------------------------------------
// Schemas de validação por agente
// ---------------------------------------------------------------------------

// Valida o formato UUID (8-4-4-4-12 hex) sem exigir version/variant bits do RFC-4122.
// Zod v4 restringe .uuid() a variantes específicas; usamos regex para compatibilidade
// com IDs gerados por outros sistemas (ex.: todos-uns, todos-zeros, UUID nil).
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

const commonFields = {
  meetingIds: z.array(uuidLike).min(1),
};

const schemas: Record<AgentName, z.ZodTypeAny> = {
  business: z.object({
    ...commonFields,
    dateRangeStart: z.string().optional(),
    dateRangeEnd: z.string().optional(),
  }),
  article: z.object({
    ...commonFields,
    focusArea: z.string().optional(),
  }),
  social: z.object({
    ...commonFields,
    platforms: z.array(z.string()).optional(),
    contentTypes: z.array(z.string()).optional(),
    tone: z.string().optional(),
  }),
};

// ---------------------------------------------------------------------------
// Tipo de contexto — suporta injeção de dependência em testes
// ---------------------------------------------------------------------------

type TriggerFn = (meetingIds: string[], opts?: Record<string, unknown>) => Promise<N8nResult<unknown>>;

interface RouteCtx {
  params: Promise<{ agent: string }>;
  /** Apenas para testes: sobrescreve userId e/ou trigger sem atingir a rede. */
  __test?: {
    trigger?: TriggerFn;
    userId?: string;
  };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function POST(request: Request, ctx: RouteCtx) {
  // 1. Resolve o agente a partir dos parâmetros dinâmicos
  const { agent } = await ctx.params;

  if (!(AGENTS as readonly string[]).includes(agent)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
  }

  const agentName = agent as AgentName;

  // 2. Verifica configuração obrigatória (userId) — fail-fast antes de qualquer trabalho.
  const userId = ctx.__test?.userId !== undefined ? ctx.__test.userId : getDefaultUserId();
  if (!userId) {
    console.error('[API] POST /api/agents/[agent]: N8N_DEFAULT_USER_ID não configurado');
    return NextResponse.json(
      { error: 'Configuração ausente: N8N_DEFAULT_USER_ID' },
      { status: 500 },
    );
  }

  // 3. Lê e valida o corpo da requisição
  const raw = await request.json().catch(() => ({}));

  let validated: Record<string, unknown>;
  try {
    validated = schemas[agentName].parse(raw) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
        },
        { status: 400 },
      );
    }
    throw error; // não-Zod: propaga para o handler externo
  }

  // 4. Separa meetingIds das opts e despacha para o agente correto
  const { meetingIds, ...opts } = validated as { meetingIds: string[] } & Record<string, unknown>;

  let result: N8nResult<unknown>;

  if (ctx.__test?.trigger) {
    // Modo teste: usa o trigger injetado
    result = await ctx.__test.trigger(meetingIds, opts);
  } else if (agentName === 'business') {
    result = await triggerBusiness(meetingIds, opts as BusinessOpts);
  } else if (agentName === 'article') {
    result = await triggerArticle(meetingIds, opts as ArticleOpts);
  } else {
    result = await triggerSocial(meetingIds, opts as SocialOpts);
  }

  // 5. Mapeia o resultado do agente para a resposta HTTP
  if (!result.ok) {
    // Detalhe do n8n (URLs de webhook, nomes de nós) fica só no log do servidor;
    // o cliente recebe uma mensagem genérica para não vazar internals.
    console.error(`[API] POST /api/agents/${agentName}: agente retornou erro —`, result.error);
    return NextResponse.json({ error: 'Falha ao disparar agente' }, { status: result.status ?? 502 });
  }

  return NextResponse.json(
    { data: { triggered: true, agent: agentName, meetingIds } },
    { status: 202 },
  );
}
