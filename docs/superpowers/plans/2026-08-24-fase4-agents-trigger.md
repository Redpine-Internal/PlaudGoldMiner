# Fase 4 — App dispara agentes n8n (trigger + track) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app 3 rotas para disparar os agentes n8n (business/article/social) sobre reuniões já resumidas, mais 1 rota para ler o status via `agent_executions` — sem rodar IA no app e sem alterar workflows do n8n.

**Architecture:** Uma camada fina `lib/n8n/agents.ts` monta `{ user_id, meeting_ids, ...opts }` e reusa `callWebhook` (que já envia o header `x-plaude-api-key`). Uma rota dinâmica `app/api/agents/[agent]/route.ts` valida entrada (zod) e dispara; uma rota `app/api/agents/executions/route.ts` lê `agent_executions` direto pelo `pool`. `user_id` vem do env `N8N_DEFAULT_USER_ID`.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, zod, `pg` Pool (`@/lib/db`), `callWebhook` (`@/lib/n8n/client`). Sem framework de teste — verificação por scripts `tsx` descartáveis com `node:assert/strict`, auto-limpantes.

**Spec:** `docs/superpowers/specs/2026-08-24-fase4-agents-trigger-design.md`

**Verification note (harness quirk):** rodar script tsx que importa de `@/lib/...` falha via `node --import tsx -e '...'` ("does not provide an export"). Padrão que FUNCIONA: escrever um arquivo temp `.mts` com imports por caminho ABSOLUTO, rodar `node --env-file=.env --import tsx /tmp/x.mts`, depois `rm -f`. IDE/LSP reporta falsos "Cannot find module '@/...'"; a única checagem autoritativa é `npx tsc --noEmit` no CLI.

---

## File Structure

- **Create `lib/n8n/agents.ts`** — camada de disparo. Uma função por agente (`triggerBusiness`/`triggerArticle`/`triggerSocial`), mais tipos de opções. Responsabilidade única: montar payload + chamar `callWebhook`. Não toca no banco, não valida (isso é do handler).
- **Create `app/api/agents/[agent]/route.ts`** — 1 rota dinâmica `POST` para os 3 disparos. Whitelist do `agent`, validação zod por agente, injeção do `user_id`, tradução do `N8nResult` para HTTP.
- **Create `app/api/agents/executions/route.ts`** — rota `GET` só-leitura que consulta `agent_executions` via `pool`.
- **Modify `.env`** — adicionar `N8N_DEFAULT_USER_ID=andreza@ehsbrasil.com` (não versionado).
- **Modify `.env.example`** — documentar `N8N_DEFAULT_USER_ID` (versionado, sem segredo).

---

## Task 1: Camada de disparo `lib/n8n/agents.ts`

**Files:**
- Create: `lib/n8n/agents.ts`
- Test: script tsx descartável `/tmp/fase4-agents-test.mts` (deletado ao fim)

Contexto: `callWebhook<T>(id, payload)` de `@/lib/n8n/client` já faz o POST com header `x-plaude-api-key`. Os webhook ids válidos em `@/lib/n8n/types` são `'business-opportunities'`, `'article-insights'`, `'social-content'`. O n8n exige body `{ user_id, meeting_ids }`; opções extras por agente conforme spec.

- [ ] **Step 1: Escrever o teste que falha**

Criar `/tmp/fase4-agents-test.mts` (caminhos absolutos — ajuste o prefixo se o repo estiver noutro lugar; aqui é `/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights`):

```ts
import assert from 'node:assert/strict';

// Força o env ANTES de importar o módulo (o módulo lê process.env no load).
process.env.N8N_DEFAULT_USER_ID = 'operador@test.com';

const ROOT = '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights';

// Mock de callWebhook: captura o que foi enviado, sem rede.
const calls: { id: string; payload: any }[] = [];
const clientMod = await import(ROOT + '/lib/n8n/client.ts');
(clientMod as any).callWebhook = async (id: string, payload: any) => {
  calls.push({ id, payload });
  return { ok: true, data: {} };
};

// Import DEPOIS do mock não reescreve o binding do ESM já ligado; então
// testamos a montagem do payload chamando a função e inspecionando via
// um callWebhook injetável. Para manter simples, agents.ts aceita um
// `deps` opcional com callWebhook (injeção de dependência para teste).
const agents = await import(ROOT + '/lib/n8n/agents.ts');

// business: só user_id + meeting_ids quando sem opts
{
  const captured: any[] = [];
  const deps = { callWebhook: async (id: string, payload: any) => { captured.push({ id, payload }); return { ok: true, data: {} }; } };
  await agents.triggerBusiness(['m1', 'm2'], undefined, deps);
  assert.equal(captured[0].id, 'business-opportunities');
  assert.deepEqual(captured[0].payload, { user_id: 'operador@test.com', meeting_ids: ['m1', 'm2'] });
}

// business: inclui opts quando fornecidas
{
  const captured: any[] = [];
  const deps = { callWebhook: async (id: string, payload: any) => { captured.push({ id, payload }); return { ok: true, data: {} }; } };
  await agents.triggerBusiness(['m1'], { dateRangeStart: '2026-01-01', dateRangeEnd: '2026-02-01' }, deps);
  assert.deepEqual(captured[0].payload, {
    user_id: 'operador@test.com', meeting_ids: ['m1'],
    date_range_start: '2026-01-01', date_range_end: '2026-02-01',
  });
}

// article: focus_area
{
  const captured: any[] = [];
  const deps = { callWebhook: async (id: string, payload: any) => { captured.push({ id, payload }); return { ok: true, data: {} }; } };
  await agents.triggerArticle(['m1'], { focusArea: 'NR-35' }, deps);
  assert.equal(captured[0].id, 'article-insights');
  assert.deepEqual(captured[0].payload, { user_id: 'operador@test.com', meeting_ids: ['m1'], focus_area: 'NR-35' });
}

// social: platforms/content_types/tone
{
  const captured: any[] = [];
  const deps = { callWebhook: async (id: string, payload: any) => { captured.push({ id, payload }); return { ok: true, data: {} }; } };
  await agents.triggerSocial(['m1'], { platforms: ['instagram'], contentTypes: ['post'], tone: 'professional' }, deps);
  assert.equal(captured[0].id, 'social-content');
  assert.deepEqual(captured[0].payload, {
    user_id: 'operador@test.com', meeting_ids: ['m1'],
    platforms: ['instagram'], content_types: ['post'], tone: 'professional',
  });
}

console.log('OK agents.ts');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-agents-test.mts
```
Expected: FALHA com erro de módulo não encontrado / `agents.triggerBusiness is not a function` (arquivo ainda não existe).

- [ ] **Step 3: Implementar `lib/n8n/agents.ts`**

```ts
// Camada de disparo dos agentes n8n (Fase 4). Monta o payload que os nós
// `Validate` dos webhooks 02/04/05 exigem — { user_id, meeting_ids } + opts —
// e reusa callWebhook (que já envia o header x-plaude-api-key). NÃO toca no
// banco e NÃO valida entrada: validação é do route handler (zod).

import { callWebhook as defaultCallWebhook } from './client';
import type { N8nWebhookId, N8nResult } from './types';

// user_id é rótulo de rastreio (app de operador único). Vem do env; se ausente,
// o handler devolve 500 com mensagem clara — aqui a string vazia é propagada.
const N8N_DEFAULT_USER_ID = process.env.N8N_DEFAULT_USER_ID || '';

export function getDefaultUserId(): string {
  return N8N_DEFAULT_USER_ID;
}

// Injeção de dependência só para teste; produção usa o default.
export interface AgentDeps {
  callWebhook: typeof defaultCallWebhook;
}
const prodDeps: AgentDeps = { callWebhook: defaultCallWebhook };

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

// jsonStripUndefined: monta o payload sem chaves undefined (o n8n só quer as presentes).
function base(meetingIds: string[]): Record<string, unknown> {
  return { user_id: N8N_DEFAULT_USER_ID, meeting_ids: meetingIds };
}

async function fire(
  id: N8nWebhookId,
  payload: Record<string, unknown>,
  deps: AgentDeps
): Promise<N8nResult<unknown>> {
  return deps.callWebhook(id, payload);
}

export function triggerBusiness(
  meetingIds: string[],
  opts?: BusinessOpts,
  deps: AgentDeps = prodDeps
): Promise<N8nResult<unknown>> {
  const payload = base(meetingIds);
  if (opts?.dateRangeStart !== undefined) payload.date_range_start = opts.dateRangeStart;
  if (opts?.dateRangeEnd !== undefined) payload.date_range_end = opts.dateRangeEnd;
  return fire('business-opportunities', payload, deps);
}

export function triggerArticle(
  meetingIds: string[],
  opts?: ArticleOpts,
  deps: AgentDeps = prodDeps
): Promise<N8nResult<unknown>> {
  const payload = base(meetingIds);
  if (opts?.focusArea !== undefined) payload.focus_area = opts.focusArea;
  return fire('article-insights', payload, deps);
}

export function triggerSocial(
  meetingIds: string[],
  opts?: SocialOpts,
  deps: AgentDeps = prodDeps
): Promise<N8nResult<unknown>> {
  const payload = base(meetingIds);
  if (opts?.platforms !== undefined) payload.platforms = opts.platforms;
  if (opts?.contentTypes !== undefined) payload.content_types = opts.contentTypes;
  if (opts?.tone !== undefined) payload.tone = opts.tone;
  return fire('social-content', payload, deps);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-agents-test.mts && rm -f /tmp/fase4-agents-test.mts
```
Expected: imprime `OK agents.ts` e sai 0. Depois `rm -f` remove o script.

- [ ] **Step 5: Checar tipos**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
git add lib/n8n/agents.ts
git commit -m "feat: camada de disparo dos agentes n8n (lib/n8n/agents)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Env `N8N_DEFAULT_USER_ID`

**Files:**
- Modify: `.env` (não versionado — só append da linha)
- Modify: `.env.example` (versionado — sem segredo)

- [ ] **Step 1: Adicionar ao `.env`**

Acrescentar a linha ao final da seção n8n do `.env` (usar Edit; NÃO commitar `.env`):

```
N8N_DEFAULT_USER_ID=andreza@ehsbrasil.com
```

- [ ] **Step 2: Documentar em `.env.example`**

Adicionar após `N8N_WEBHOOK_SECRET=` no `.env.example`:

```
# N8N_DEFAULT_USER_ID: rótulo de operador enviado como user_id aos agentes n8n
# (Fase 4). É texto livre; app de operador único. Ex.: andreza@ehsbrasil.com
N8N_DEFAULT_USER_ID=
```

- [ ] **Step 3: Confirmar que `.env` NÃO entra no commit**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && git check-ignore .env && echo ".env ignorado OK"
```
Expected: imprime `.env` e `.env ignorado OK`. Se `.env` NÃO for ignorado, PARE e reporte (nunca commitar `.env`).

- [ ] **Step 4: Commit (só `.env.example`)**

```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
git add .env.example
git commit -m "docs: documentar N8N_DEFAULT_USER_ID no .env.example (Fase 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rota de disparo `app/api/agents/[agent]/route.ts`

**Files:**
- Create: `app/api/agents/[agent]/route.ts`
- Test: script tsx descartável `/tmp/fase4-route-test.mts`

Contexto: em App Router, o handler recebe `(request, ctx)` onde `ctx.params` é uma `Promise` (Next 16). O padrão de validação zod (400 com `details`) segue `app/api/plaud/ingest/route.ts`. `NextResponse` de `next/server`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `/tmp/fase4-route-test.mts`:

```ts
import assert from 'node:assert/strict';
process.env.N8N_DEFAULT_USER_ID = 'operador@test.com';
const ROOT = '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights';

const mod = await import(ROOT + '/app/api/agents/[agent]/route.ts');

function req(body: unknown) {
  return new Request('http://localhost/api/agents/business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// agent fora da whitelist -> 404
{
  const res = await mod.POST(req({ meetingIds: ['m1'] }), { params: Promise.resolve({ agent: 'xpto' }) });
  assert.equal(res.status, 404);
}

// body inválido (meetingIds vazio) -> 400
{
  const res = await mod.POST(req({ meetingIds: [] }), { params: Promise.resolve({ agent: 'business' }) });
  assert.equal(res.status, 400);
}

// sucesso -> 202 (injetando trigger que não faz rede via env de teste:
// a rota usa as funções reais de agents.ts, que chamam callWebhook; para não
// bater na rede, o teste sobrescreve N8N_BASE_URL para um host inexistente e
// aceita 202 SOMENTE se a rota for fire-and-forget. Como a rota AGUARDA o
// resultado, validamos o caminho de sucesso com um webhook mock via global.)
// -> ver Step 3: a rota aceita deps de teste através de um símbolo opcional.
{
  const res = await mod.POST(req({ meetingIds: ['m1'] }), {
    params: Promise.resolve({ agent: 'business' }),
    // @ts-expect-error test-only dep injection
    __test: { trigger: async () => ({ ok: true, data: {} }) },
  });
  assert.equal(res.status, 202);
  const json = await res.json();
  assert.equal(json.data.triggered, true);
  assert.equal(json.data.agent, 'business');
}

// config faltando -> 500
{
  const saved = process.env.N8N_DEFAULT_USER_ID;
  // A rota lê getDefaultUserId() em runtime; para simular, injeta userId vazio via __test.
  const res = await mod.POST(req({ meetingIds: ['m1'] }), {
    params: Promise.resolve({ agent: 'business' }),
    // @ts-expect-error test-only dep injection
    __test: { userId: '' },
  });
  assert.equal(res.status, 500);
  process.env.N8N_DEFAULT_USER_ID = saved;
}

console.log('OK route [agent]');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-route-test.mts
```
Expected: FALHA (arquivo de rota não existe).

- [ ] **Step 3: Implementar `app/api/agents/[agent]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  triggerBusiness,
  triggerArticle,
  triggerSocial,
  getDefaultUserId,
  type BusinessOpts,
  type ArticleOpts,
  type SocialOpts,
} from '@/lib/n8n/agents';
import type { N8nResult } from '@/lib/n8n/types';

// Whitelist dos agentes disparáveis. Fora disso -> 404.
const AGENTS = ['business', 'article', 'social'] as const;
type Agent = (typeof AGENTS)[number];

const uuidArray = z.array(z.string().uuid()).min(1);

const businessSchema = z.object({
  meetingIds: uuidArray,
  dateRangeStart: z.string().optional(),
  dateRangeEnd: z.string().optional(),
});
const articleSchema = z.object({
  meetingIds: uuidArray,
  focusArea: z.string().optional(),
});
const socialSchema = z.object({
  meetingIds: uuidArray,
  platforms: z.array(z.string()).optional(),
  contentTypes: z.array(z.string()).optional(),
  tone: z.string().optional(),
});

// Injeção de dependência só para teste (via ctx.__test). Produção ignora.
interface TestDeps {
  trigger?: (meetingIds: string[], opts: unknown) => Promise<N8nResult<unknown>>;
  userId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ agent: string }>; __test?: TestDeps }
) {
  const { agent } = await ctx.params;
  if (!AGENTS.includes(agent as Agent)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });
  }

  const raw = await request.json().catch(() => ({}));

  // Valida conforme o agente.
  let parsed:
    | { agent: 'business'; body: z.infer<typeof businessSchema> }
    | { agent: 'article'; body: z.infer<typeof articleSchema> }
    | { agent: 'social'; body: z.infer<typeof socialSchema> };
  try {
    if (agent === 'business') parsed = { agent, body: businessSchema.parse(raw) };
    else if (agent === 'article') parsed = { agent, body: articleSchema.parse(raw) };
    else parsed = { agent: 'social', body: socialSchema.parse(raw) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }
    throw error;
  }

  // Config obrigatória: user_id do operador.
  const userId = ctx.__test?.userId !== undefined ? ctx.__test.userId : getDefaultUserId();
  if (!userId) {
    console.error('[API] /api/agents: N8N_DEFAULT_USER_ID ausente');
    return NextResponse.json(
      { error: 'Configuração ausente: N8N_DEFAULT_USER_ID' },
      { status: 500 }
    );
  }

  // Dispara. Em teste, ctx.__test.trigger substitui a rede.
  let result: N8nResult<unknown>;
  if (ctx.__test?.trigger) {
    result = await ctx.__test.trigger(parsed.body.meetingIds, parsed.body);
  } else if (parsed.agent === 'business') {
    const opts: BusinessOpts = {
      dateRangeStart: parsed.body.dateRangeStart,
      dateRangeEnd: parsed.body.dateRangeEnd,
    };
    result = await triggerBusiness(parsed.body.meetingIds, opts);
  } else if (parsed.agent === 'article') {
    const opts: ArticleOpts = { focusArea: parsed.body.focusArea };
    result = await triggerArticle(parsed.body.meetingIds, opts);
  } else {
    const opts: SocialOpts = {
      platforms: parsed.body.platforms,
      contentTypes: parsed.body.contentTypes,
      tone: parsed.body.tone,
    };
    result = await triggerSocial(parsed.body.meetingIds, opts);
  }

  if (!result.ok) {
    const status = typeof result.status === 'number' ? result.status : 502;
    console.error(`[API] /api/agents/${agent} disparo falhou:`, result.error);
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { data: { triggered: true, agent, meetingIds: parsed.body.meetingIds } },
    { status: 202 }
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-route-test.mts && rm -f /tmp/fase4-route-test.mts
```
Expected: imprime `OK route [agent]` e sai 0.

- [ ] **Step 5: Checar tipos**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
git add "app/api/agents/[agent]/route.ts"
git commit -m "feat: rota POST /api/agents/[agent] dispara agentes n8n

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rota de status `app/api/agents/executions/route.ts`

**Files:**
- Create: `app/api/agents/executions/route.ts`
- Test: script tsx descartável `/tmp/fase4-exec-test.mts` (roda contra o banco real, só-leitura)

Contexto: `agent_executions` tem colunas `id, agent_name, triggered_by, meeting_ids, input_params, status, result_id, result_table, completed_at, created_at`. Consulta via `pool.query`. Clamp de `limit` como em `app/api/opportunities/route.ts` (default 20, max 100).

- [ ] **Step 1: Escrever o teste que falha**

Criar `/tmp/fase4-exec-test.mts`:

```ts
import assert from 'node:assert/strict';
const ROOT = '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights';
const mod = await import(ROOT + '/app/api/agents/executions/route.ts');
const { pool } = await import(ROOT + '/lib/db/index.ts');

// Sem filtro: responde 200 com data array (mesmo que vazio).
{
  const res = await mod.GET(new Request('http://localhost/api/agents/executions'));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data), 'data deve ser array');
}

// Filtro por agent inexistente: 200, array vazio.
{
  const res = await mod.GET(new Request('http://localhost/api/agents/executions?agent=__none__'));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.data, []);
}

// limit é clampado (não estoura): pede 9999, aceita <= 100.
{
  const res = await mod.GET(new Request('http://localhost/api/agents/executions?limit=9999'));
  assert.equal(res.status, 200);
}

await pool.end();
console.log('OK executions');
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-exec-test.mts
```
Expected: FALHA (arquivo de rota não existe).

- [ ] **Step 3: Implementar `app/api/agents/executions/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Uma linha de agent_executions como o app expõe para a UI acompanhar o disparo.
interface AgentExecutionRow {
  id: string;
  agent_name: string;
  triggered_by: string;
  meeting_ids: string[] | null;
  status: string;
  result_id: string | null;
  result_table: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Lê o rastreio das execuções dos agentes n8n (Fase 4). Só-leitura.
 * A UI faz polling aqui após disparar para saber quando `status=completed`,
 * e então lê a tabela de saída (business_opportunities / article_insights /
 * social_posts) já implementada na Fase 2.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agent = searchParams.get('agent');
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    const cols = `id, agent_name, triggered_by, meeting_ids, status,
                  result_id, result_table, created_at, completed_at`;

    const res = agent
      ? await pool.query<AgentExecutionRow>(
          `SELECT ${cols} FROM agent_executions
            WHERE agent_name = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [agent, limit]
        )
      : await pool.query<AgentExecutionRow>(
          `SELECT ${cols} FROM agent_executions
            ORDER BY created_at DESC
            LIMIT $1`,
          [limit]
        );

    return NextResponse.json({ data: res.rows });
  } catch (error) {
    console.error('[API] GET /api/agents/executions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-exec-test.mts && rm -f /tmp/fase4-exec-test.mts
```
Expected: imprime `OK executions` e sai 0.

- [ ] **Step 5: Checar tipos**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
git add app/api/agents/executions/route.ts
git commit -m "feat: rota GET /api/agents/executions lê status via agent_executions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verificação end-to-end (smoke, sem disparar IA real)

**Files:**
- Test: script tsx descartável `/tmp/fase4-smoke.mts`

Objetivo: provar que a rota de disparo monta o payload correto e que o webhook do n8n ACEITA a chamada (nó `Validate` passa) — usando UM meeting_id real, mas confirmando só a aceitação (2xx do webhook), sem depender do resultado assíncrono da IA. Se preferir não tocar a rede n8n, PULE este task e confie nos testes unitários dos Tasks 1/3.

- [ ] **Step 1: Pegar 1 meeting_id real**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
cat > /tmp/fase4-pick.mts <<'TS'
import { pool } from '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights/lib/db/index.ts';
const r = await pool.query(`SELECT m.id FROM meetings m JOIN summaries s ON s.meeting_id = m.id LIMIT 1`);
console.log(r.rows[0]?.id ?? 'NENHUM');
await pool.end();
TS
node --env-file=.env --import tsx /tmp/fase4-pick.mts; rm -f /tmp/fase4-pick.mts
```
Expected: imprime um UUID (guarde-o para o Step 2).

- [ ] **Step 2: Disparar via `lib/n8n/agents.ts` e confirmar aceitação**

Criar `/tmp/fase4-smoke.mts` (substituir `<MEETING_ID>` pelo UUID do Step 1):

```ts
import assert from 'node:assert/strict';
const ROOT = '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights';
const agents = await import(ROOT + '/lib/n8n/agents.ts');

const res = await agents.triggerBusiness(['<MEETING_ID>']);
console.log('n8n respondeu ok=', res.ok, 'status=', (res as any).status, 'erro=', (res as any).error);
// Aceitação: ok=true (2xx). Se o webhook 02 responder erro de negócio mas 2xx,
// callWebhook devolve ok=true — o que basta para provar que a auth/contract passou.
assert.equal(res.ok, true, 'webhook business deveria aceitar o disparo');
console.log('OK smoke');
```

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fase4-smoke.mts && rm -f /tmp/fase4-smoke.mts
```
Expected: `ok= true` e `OK smoke`. Se `ok=false` com status 401/403, a auth falhou — PARE e reporte (não é esperado; o segredo já foi validado). Se timeout/erro de rede, reportar como indeterminado.

- [ ] **Step 3: Confirmar que uma execução foi registrada**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
cat > /tmp/fase4-check.mts <<'TS'
import { pool } from '/Users/wesleycardoso/Redpine/ehs-insights/ehs-insights/lib/db/index.ts';
const r = await pool.query(`SELECT agent_name, status, created_at FROM agent_executions ORDER BY created_at DESC LIMIT 3`);
console.table(r.rows);
await pool.end();
TS
node --env-file=.env --import tsx /tmp/fase4-check.mts; rm -f /tmp/fase4-check.mts
```
Expected: pelo menos 1 linha com `agent_name='business'` (status `running` ou `completed`). Isso PROVA que o n8n consumiu meetings do banco disparado pelo app — o objetivo da Fase 4.

- [ ] **Step 4: (sem commit — verificação apenas)**

Este task não altera código; nada a commitar.

---

## Task 6: Corrigir defeito latente do workflow 04 no n8n (via API)

**Files:**
- Externo: workflow n8n `JRJnpROaHxDh9U9y` (Plaude 04 - Scientific Article Insights)

Contexto: o nó `Update Execution` do 04 referencia `$('Parse').first().json.execution_id`, mas o nó `Parse` não define `execution_id` (o `Log Execution` é quem tem o `id` da execução). Isso faz o UPDATE final do `agent_executions` para `completed` provavelmente virar no-op no 04 — a execução fica presa em `running` mesmo tendo gravado `article_insights`. O 02 e o 05 usam o id correto (02 via `execution_id` setado no Parse; 05 via `_execution_id`). Correção: fazer o 04 usar o id do `Log Execution`, como os outros.

- [ ] **Step 1: Baixar o workflow 04 e localizar o nó Parse e Update Execution**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
KEY=$(grep -E '^N8N_API_KEY=' .env | cut -d= -f2-)
BASE=$(grep -E '^N8N_BASE_URL=' .env | cut -d= -f2-); BASE=${BASE:-https://n8n-prd.mychatbot.us}
curl -s -H "X-N8N-API-KEY: $KEY" "$BASE/api/v1/workflows/JRJnpROaHxDh9U9y" > /tmp/wf04.json
python3 - <<'PY'
import json
w=json.load(open('/tmp/wf04.json'))
for n in w['nodes']:
    if n['name'] in ('Parse','Update Execution','Log Execution'):
        print('---',n['name'])
        p=n.get('parameters',{})
        print(p.get('jsCode') or p.get('query'))
PY
```
Expected: mostra o `jsCode` do `Parse` (sem `execution_id`), a `query` do `Update Execution` (usa `$('Parse')...execution_id`), e a query do `Log Execution` (INSERT ... RETURNING *, cujo `id` é a execução).

- [ ] **Step 2: Decidir a correção mínima**

Duas opções equivalentes; escolha a que menos altera o workflow:
- (A) No `Parse`, adicionar `execution_id: $('Log Execution').first().json.id` ao objeto retornado. O `Update Execution` já referencia `$('Parse').first().json.execution_id`, então passa a funcionar.
- (B) Alterar a query do `Update Execution` para `WHERE id = '{{ $('Log Execution').first().json.id }}'`.

Recomendado: **(A)** — 1 linha no Parse, alinha o 04 ao padrão do 02.

- [ ] **Step 3: Aplicar via API (PUT do workflow com o Parse corrigido)**

Criar `/tmp/fix-wf04.mts` (usa a API n8n; edita só o jsCode do Parse, preserva o resto):

```ts
import { readFile } from 'node:fs/promises';
const BASE = process.env.N8N_BASE_URL || 'https://n8n-prd.mychatbot.us';
const KEY = process.env.N8N_API_KEY || '';
const w = JSON.parse(await readFile('/tmp/wf04.json', 'utf8'));

const parse = w.nodes.find((n: any) => n.name === 'Parse');
if (!parse) throw new Error('nó Parse não encontrado');
const code: string = parse.parameters.jsCode;
if (code.includes('execution_id')) {
  console.log('Parse já define execution_id — nada a fazer.');
  process.exit(0);
}
// Injeta execution_id no objeto retornado. O Parse termina em "return [{ json: { ... } }];".
// Estratégia robusta: inserir a linha antes de "user_id:" dentro do json.
const patched = code.replace(
  /return \[\{ json: \{/,
  "const _execId = $('Log Execution').first().json.id;\n  return [{ json: {\n    execution_id: _execId,"
);
if (patched === code) throw new Error('não consegui localizar o ponto de injeção no Parse');
parse.parameters.jsCode = patched;

// PUT só com os campos aceitos pela API (name, nodes, connections, settings).
const body = {
  name: w.name,
  nodes: w.nodes,
  connections: w.connections,
  settings: w.settings ?? {},
};
const res = await fetch(`${BASE}/api/v1/workflows/JRJnpROaHxDh9U9y`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('PUT status', res.status);
if (!res.ok) { console.error(await res.text()); process.exit(1); }
console.log('workflow 04 atualizado.');
```

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights && node --env-file=.env --import tsx /tmp/fix-wf04.mts
```
Expected: `PUT status 200` e `workflow 04 atualizado.` (ou `Parse já define execution_id — nada a fazer.` se já corrigido).

- [ ] **Step 3b: Se o PUT falhar (403/405/campo inválido), NÃO insistir**

Se a API n8n rejeitar o PUT (algumas instâncias bloqueiam update de workflow via API pública), reverter para: registrar o defeito num arquivo `docs/n8n-defeito-wf04.md` com as opções (A)/(B) para correção manual no editor n8n, e seguir. Não é bloqueante para a Fase 4 (o 04 grava `article_insights`; só o status `completed` fica atrasado).

Run (só se PUT falhou):
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
cat > docs/n8n-defeito-wf04.md <<'MD'
# Defeito n8n — Workflow 04 (Scientific Article Insights)

`Update Execution` referencia `$('Parse').first().json.execution_id`, mas o nó
`Parse` não define `execution_id`. Resultado: o UPDATE final que marca a execução
como `completed` vira no-op — a execução fica em `running` apesar de gravar em
`article_insights`.

Correção manual (editor n8n), escolher uma:
- (A) No nó `Parse`, incluir no objeto retornado:
  `execution_id: $('Log Execution').first().json.id`
- (B) No nó `Update Execution`, trocar o WHERE para:
  `WHERE id = '{{ $('Log Execution').first().json.id }}'`

02 e 05 já usam o id correto; alinhar o 04 ao 02.
MD
git add docs/n8n-defeito-wf04.md
git commit -m "docs: registrar defeito do workflow 04 n8n (correção via editor)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Verificar a correção (se PUT teve sucesso)**

Run:
```bash
cd /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights
KEY=$(grep -E '^N8N_API_KEY=' .env | cut -d= -f2-)
BASE=$(grep -E '^N8N_BASE_URL=' .env | cut -d= -f2-); BASE=${BASE:-https://n8n-prd.mychatbot.us}
curl -s -H "X-N8N-API-KEY: $KEY" "$BASE/api/v1/workflows/JRJnpROaHxDh9U9y" \
 | python3 -c "import sys,json; w=json.load(sys.stdin); p=[n for n in w['nodes'] if n['name']=='Parse'][0]; print('execution_id' in p['parameters']['jsCode'])"
rm -f /tmp/wf04.json /tmp/fix-wf04.mts
```
Expected: imprime `True` (o Parse agora define `execution_id`).

- [ ] **Step 5: (sem commit de código app — mudança é no n8n)**

Se o PUT teve sucesso, nada a commitar no repo (a mudança vive no n8n). Se caiu no fallback 3b, o commit do doc já foi feito.

---

## Self-Review

**1. Spec coverage:**
- 3 rotas de disparo → Task 3 (rota dinâmica cobre os 3 agentes). ✅
- Rota de status lendo `agent_executions` → Task 4. ✅
- `user_id` via `N8N_DEFAULT_USER_ID` → Task 2 (env) + Task 1 (`getDefaultUserId`) + Task 3 (uso/500 se ausente). ✅
- Camada de disparo reusando `callWebhook` → Task 1. ✅
- Contrato `{ user_id, meeting_ids, ...opts }` por agente → Task 1 (payloads) + Task 3 (zod). ✅
- Erros (400/404/500/502) → Task 3. ✅
- Fire-and-forget 202 → Task 3. ✅
- Testes tsx descartáveis + tsc → todos os tasks. ✅
- Defeito latente do wf04 → Task 6 (spec o listava como "fora de escopo app-side"; usuário pediu "corrija o necessário", então incluído como task n8n via API, com fallback documentado). ✅
- Segredos não vazam / `.env` não commitado → Task 2 Step 3 (check-ignore) + logs sem segredo. ✅

**2. Placeholder scan:** `<MEETING_ID>` e `<MEETItING_ID>` em Task 5 são substituições explícitas guiadas por comando no Step anterior — aceitável (valor vem do Step 1). Sem "TODO"/"TBD"/"add error handling" genérico.

**3. Type consistency:** `triggerBusiness/Article/Social(meetingIds, opts?, deps?)`, `getDefaultUserId()`, `BusinessOpts/ArticleOpts/SocialOpts`, `N8nResult` — nomes idênticos entre Task 1, Task 3 e testes. Webhook ids (`business-opportunities`/`article-insights`/`social-content`) batem com `lib/n8n/types.ts`. Colunas de `agent_executions` no Task 4 batem com o schema verificado no spec. ✅
