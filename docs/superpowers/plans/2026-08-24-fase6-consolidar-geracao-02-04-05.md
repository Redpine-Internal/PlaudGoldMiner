# Fase 6 — Consolidar geração 02/04/05 no app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reapontar a leitura de Oportunidades para a fonte local `app_opportunities`, remover a camada de disparo morta da Fase 4, limpar os webhooks 02/04/05 de `types.ts` e desativar os workflows 02/04/05 no n8n — sem tocar no Clone.

**Architecture:** A geração local de 02/04/05 já existe e a UI já a aciona (04→`/api/insights/analyze`, 05→`/api/contents/analyze`, 02→automático no processamento da reunião via `app_opportunities`). Esta fase só troca a fonte de leitura das rotas de Oportunidades (de `business_opportunities` do n8n para `app_opportunities` local), deleta código de disparo n8n que nada aciona, e desativa (reversível) os três workflows no n8n. Clone (01/03/07, embeddings, pgvector) intocado.

**Tech Stack:** Next.js 16 App Router, TypeScript, `pg` Pool (`@/lib/db`), n8n management API (`X-N8N-API-KEY`). Sem framework de testes — verificação por `npx tsc --noEmit`, `npx eslint`, `grep` e smoke via `fetch` em `.mts` temporário.

**Spec:** `docs/superpowers/specs/2026-08-24-fase6-consolidar-geracao-02-04-05-design.md`

---

## Notas de ambiente (leia antes de começar)

- **Sem testes unitários.** O projeto não tem framework de testes. Cada tarefa
  verifica com `npx tsc --noEmit` (typecheck autoritativo), `npx eslint`, `grep`
  e, quando aplicável, um smoke HTTP.
- **`curl` NÃO existe no sandbox.** Para bater em HTTP use Node `fetch` num
  arquivo `.mts` temporário rodado com
  `node --env-file=.env --import tsx /tmp/x.mts` e apague com `rm -f` depois.
- **Segredos:** nunca imprima `N8N_API_KEY`, `N8N_WEBHOOK_SECRET` ou strings de
  conexão sem mascarar. Nunca commite `.env`.
- **Branch:** o trabalho está na branch `fase6-consolidar-geracao-02-04-05`
  (já criada, com o spec commitado).
- **Ordem importa:** delete `agents.ts` (Task 3) ANTES de limpar `types.ts`
  (Task 5), senão o typecheck de `agents.ts` quebra ao remover as chaves.

---

## File Structure

**Modificados:**
- `app/api/opportunities/route.ts` — passa a ler `app_opportunities` (lista).
- `app/api/opportunities/[id]/route.ts` — passa a ler `app_opportunities` (detalhe, id real).
- `lib/n8n/types.ts` — remove as 3 chaves de webhook 02/04/05 do union e do mapa.

**Deletados:**
- `lib/n8n/agents.ts` — camada de disparo Fase 4 (sem uso).
- `app/api/agents/[agent]/route.ts` + pasta `app/api/agents/[agent]/`.
- `app/api/agents/executions/route.ts` + pasta `app/api/agents/executions/`.
- Pasta `app/api/agents/` inteira (fica vazia após os dois acima).

**NÃO tocar (verificado):**
- `lib/n8n/mappers.ts` — `mapArticleInsights`/`mapSocialPosts` ainda usados por
  `insights/*` e `contents/*`. `mapBusinessOpportunities` deixa de ser importado,
  mas o arquivo não é editado.
- `lib/n8n/client.ts`, `lib/n8n/poll-execution.ts`, `lib/n8n/enrich.ts`.
- Rotas `insights/*`, `contents/*`, geradores locais, UI.
- Qualquer coisa do Clone (01/03/07, embeddings).

---

### Task 1: Reapontar `/api/opportunities` (lista) para `app_opportunities`

**Files:**
- Modify: `app/api/opportunities/route.ts` (arquivo inteiro, hoje 33 linhas)

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substitua TODO o conteúdo de `app/api/opportunities/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Linha de app_opportunities (tabela local; 1 linha por oportunidade).
// Casa 1:1 com OpportunityCard — sem achatamento jsonb.
interface AppOpportunityRow {
  id: string;
  conversation_id: string | null;
  title: string;
  pain: string;
  score: number;
  type: string;
  status: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const res = await pool.query<AppOpportunityRow>(
      `SELECT id, conversation_id, title, pain, score, type, status
         FROM app_opportunities
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const cards = await enrichWithConversation(
      res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        pain: r.pain,
        score: r.score,
        type: r.type,
        status: r.status,
        conversationId: r.conversation_id,
      }))
    );

    let filtered = cards;
    if (status) filtered = filtered.filter((o) => o.status === status);
    if (type) filtered = filtered.filter((o) => o.type === type);

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (o arquivo não importa mais `mapBusinessOpportunities`/`BusinessOpportunityRow`).

- [ ] **Step 3: Confirmar que a query aponta para a tabela certa**

Run: `grep -n "app_opportunities\|business_opportunities" app/api/opportunities/route.ts`
Expected: uma linha com `app_opportunities`; NENHUMA com `business_opportunities`.

- [ ] **Step 4: Commit**

```bash
git add app/api/opportunities/route.ts
git commit -m "feat(fase6): opportunities list lê de app_opportunities (fonte local)"
```

---

### Task 2: Reapontar `/api/opportunities/[id]` (detalhe) para `app_opportunities`

**Files:**
- Modify: `app/api/opportunities/[id]/route.ts` (arquivo inteiro, hoje 44 linhas)

Contexto: hoje usa id sintético `${rowId}:${index}` porque `business_opportunities`
agrupava N oportunidades num jsonb. Em `app_opportunities` o id é o id real da
linha (1 oportunidade/linha), então o parsing sintético sai e o lookup vira
`WHERE id = $1`. PATCH continua 405, mas a mensagem deixa de citar o n8n.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Substitua TODO o conteúdo de `app/api/opportunities/[id]/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_opportunities tem 1 linha por oportunidade, então o id da URL
// é o id real da linha (sem parsing sintético). Lookup direto por id.
interface AppOpportunityRow {
  id: string;
  conversation_id: string | null;
  title: string;
  pain: string;
  score: number;
  type: string;
  status: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await pool.query<AppOpportunityRow>(
      `SELECT id, conversation_id, title, pain, score, type, status
         FROM app_opportunities WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const [card] = await enrichWithConversation(
      res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        pain: r.pain,
        score: r.score,
        type: r.type,
        status: r.status,
        conversationId: r.conversation_id,
      }))
    );
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunity' }, { status: 500 });
  }
}

// Edição desabilitada nesta fase: a UI não expõe edição de oportunidade.
export async function PATCH() {
  return NextResponse.json(
    { error: 'Edição de oportunidade desabilitada nesta fase' },
    { status: 405 }
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Confirmar tabela e ausência de id sintético**

Run: `grep -n "app_opportunities\|business_opportunities\|lastIndexOf\|:\${" app/api/opportunities/[id]/route.ts`
Expected: uma linha com `app_opportunities`; NENHUMA com `business_opportunities`, `lastIndexOf` ou `:${`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/opportunities/[id]/route.ts"
git commit -m "feat(fase6): opportunity detail lê de app_opportunities (id real)"
```

---

### Task 3: Deletar a camada de disparo morta da Fase 4

**Files:**
- Delete: `lib/n8n/agents.ts`
- Delete: `app/api/agents/[agent]/route.ts`
- Delete: `app/api/agents/executions/route.ts`
- Delete (dirs): `app/api/agents/[agent]/`, `app/api/agents/executions/`, `app/api/agents/`

Contexto (verificado por grep): só `app/api/agents/[agent]/route.ts` importa
`triggerBusiness/Article/Social` de `agents.ts`; NADA na UI chama `/api/agents/*`.
`pollExecution` (o único outro consumidor de webhooks) tem zero callers e usa
`N8nWebhookId` genericamente.

- [ ] **Step 1: Confirmar que nada vivo depende desses arquivos**

Run: `grep -rn "n8n/agents\|/api/agents\|triggerBusiness\|triggerArticle\|triggerSocial\|getDefaultUserId" app/ lib/ components/ 2>/dev/null | grep -v -E "app/api/agents/|lib/n8n/agents.ts"`
Expected: NENHUMA linha (nenhum consumidor fora dos próprios arquivos a deletar).

- [ ] **Step 2: Deletar os arquivos e pastas**

```bash
git rm app/api/agents/[agent]/route.ts app/api/agents/executions/route.ts lib/n8n/agents.ts
rmdir app/api/agents/[agent] app/api/agents/executions app/api/agents 2>/dev/null || true
```

- [ ] **Step 3: Confirmar remoção**

Run: `ls app/api/agents 2>&1; ls lib/n8n/agents.ts 2>&1`
Expected: ambos "No such file or directory".

- [ ] **Step 4: Typecheck (ainda com as chaves em types.ts — deve passar)**

Run: `npx tsc --noEmit`
Expected: sem erros. (As chaves 02/04/05 ainda existem em `types.ts`; removê-las é a Task 5.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(fase6): remover camada de disparo n8n morta (agents.ts, /api/agents/*)"
```

---

### Task 4: Smoke da lista de Oportunidades contra o Postgres

Verifica que a nova query de Task 1 roda de fato contra `app_opportunities` no
Supabase e retorna cards com `conversationTitle`. Sem framework de testes —
smoke via `fetch` no servidor de dev.

**Files:**
- Create (temporário): `/tmp/fase6-smoke.mts`

- [ ] **Step 1: Subir o dev server em background**

```bash
npm run dev >/tmp/fase6-dev.log 2>&1 &
sleep 8
```

- [ ] **Step 2: Criar o smoke script**

Crie `/tmp/fase6-smoke.mts`:

```ts
const res = await fetch('http://localhost:3000/api/opportunities?limit=3');
const body = await res.json();
console.log('status', res.status);
console.log('total', body.total);
console.log('sample', JSON.stringify(body.data?.[0] ?? null, null, 2));
```

- [ ] **Step 3: Rodar o smoke**

Run: `node --import tsx /tmp/fase6-smoke.mts`
Expected: `status 200`; `total` um número ≥ 0; se houver dados, `sample` mostra
um objeto com `title`, `score`, `type`, `status`, `conversationId` e
`conversationTitle` (pode ser null). NÃO deve haver erro de tabela inexistente.

- [ ] **Step 4: Derrubar o dev server e limpar**

```bash
pkill -f "next dev" 2>/dev/null || true
rm -f /tmp/fase6-smoke.mts /tmp/fase6-dev.log
```

- [ ] **Step 5: Sem commit** (tarefa de verificação; nada a versionar).

---

### Task 5: Limpar os webhooks 02/04/05 de `lib/n8n/types.ts`

**Files:**
- Modify: `lib/n8n/types.ts:5-23`

Contexto: após deletar `agents.ts` (Task 3), nada mais passa os literais
`'business-opportunities' | 'article-insights' | 'social-content'` a
`callWebhook`. `client.ts` e `poll-execution.ts` usam `N8nWebhookId`
genericamente, então remover as 3 chaves é type-safe. Mantêm-se 01
(`process-meeting`), 03 (`embedding-compare`), 06 (`execution-status`),
07 (`embedding-approve`).

- [ ] **Step 1: Editar o union `N8nWebhookId`**

Substitua o bloco (linhas 5-12):

```ts
export type N8nWebhookId =
  | 'process-meeting' // 01
  | 'business-opportunities' // 02
  | 'embedding-compare' // 03
  | 'article-insights' // 04
  | 'social-content' // 05
  | 'execution-status' // 06
  | 'embedding-approve'; // 07
```

por:

```ts
export type N8nWebhookId =
  | 'process-meeting' // 01
  | 'embedding-compare' // 03
  | 'execution-status' // 06
  | 'embedding-approve'; // 07
```

- [ ] **Step 2: Editar o mapa `N8N_WEBHOOKS`**

Substitua o bloco (linhas 15-23):

```ts
export const N8N_WEBHOOKS: Record<N8nWebhookId, string> = {
  'process-meeting': '/webhook/4197f28e-25f3-4334-9fb0-2ea9ba58599e',
  'business-opportunities': '/webhook/plaude-business-opportunities',
  'embedding-compare': '/webhook/plaude-embedding-compare',
  'article-insights': '/webhook/plaude-article-insights',
  'social-content': '/webhook/plaude-social-content',
  'execution-status': '/webhook/plaude-execution-status',
  'embedding-approve': '/webhook/plaude-embedding-approve',
};
```

por:

```ts
export const N8N_WEBHOOKS: Record<N8nWebhookId, string> = {
  'process-meeting': '/webhook/4197f28e-25f3-4334-9fb0-2ea9ba58599e',
  'embedding-compare': '/webhook/plaude-embedding-compare',
  'execution-status': '/webhook/plaude-execution-status',
  'embedding-approve': '/webhook/plaude-embedding-approve',
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. Se aparecer erro citando `'business-opportunities'`,
`'article-insights'` ou `'social-content'`, existe um consumidor não previsto —
pare e investigue antes de prosseguir.

- [ ] **Step 4: Confirmar remoção das chaves**

Run: `grep -n "business-opportunities\|article-insights\|social-content" lib/n8n/types.ts`
Expected: NENHUMA linha.

- [ ] **Step 5: Lint**

Run: `npx eslint lib/n8n/types.ts app/api/opportunities`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add lib/n8n/types.ts
git commit -m "chore(fase6): remover webhooks 02/04/05 de types.ts (sem consumidores)"
```

---

### Task 6: Desativar os workflows 02/04/05 no n8n (reversível)

**Files:**
- Create (temporário): `/tmp/fase6-deactivate.mts`

Contexto: desativa via API de gestão (`X-N8N-API-KEY` de `N8N_API_KEY`). IDs:
02 `QtMaHYa4gZSp27Yi`, 04 `JRJnpROaHxDh9U9y`, 05 `UEafFOcgOrcqtMfa`. Endpoint
`POST {base}/api/v1/workflows/{id}/deactivate`. **Reversível** (não deleta).
NÃO tocar 01/03/07/Clone.

- [ ] **Step 1: Ler o estado atual (antes)**

Crie `/tmp/fase6-deactivate.mts`:

```ts
const BASE = process.env.N8N_BASE_URL || 'https://n8n-prd.mychatbot.us';
const KEY = process.env.N8N_API_KEY!;
const IDS: Record<string, string> = {
  '02-business': 'QtMaHYa4gZSp27Yi',
  '04-article': 'JRJnpROaHxDh9U9y',
  '05-social': 'UEafFOcgOrcqtMfa',
};
const h = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

const action = process.argv[2]; // 'status' | 'deactivate'

for (const [label, id] of Object.entries(IDS)) {
  if (action === 'deactivate') {
    const r = await fetch(`${BASE}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: h });
    const b = await r.json().catch(() => ({}));
    console.log(label, id, '→ deactivate', r.status, 'active=', (b as any).active);
  } else {
    const r = await fetch(`${BASE}/api/v1/workflows/${id}`, { headers: h });
    const b = await r.json().catch(() => ({}));
    console.log(label, id, 'status', r.status, 'active=', (b as any).active);
  }
}
```

Run: `node --env-file=.env --import tsx /tmp/fase6-deactivate.mts status`
Expected: os 3 imprimem `status 200 active= true` (estado atual: ativos).

- [ ] **Step 2: Desativar**

Run: `node --env-file=.env --import tsx /tmp/fase6-deactivate.mts deactivate`
Expected: os 3 imprimem `deactivate 200 active= false`.

- [ ] **Step 3: Reconfirmar estado (depois)**

Run: `node --env-file=.env --import tsx /tmp/fase6-deactivate.mts status`
Expected: os 3 imprimem `active= false`.

- [ ] **Step 4: Confirmar que o Clone segue ativo (não regrediu)**

Crie/append um check rápido — rode inline:

```bash
node --env-file=.env --import tsx -e "const B=process.env.N8N_BASE_URL||'https://n8n-prd.mychatbot.us';const K=process.env.N8N_API_KEY;for(const id of ['UddqPrddu1psfQY8','mTrPHSzpA0QYnaBN','t5m4ydAU9xpTupTY']){const r=await fetch(B+'/api/v1/workflows/'+id,{headers:{'X-N8N-API-KEY':K}});const b=await r.json();console.log(id,'active=',b.active);}"
```

Expected: `UddqPrddu1psfQY8` (01), `mTrPHSzpA0QYnaBN` (03), `t5m4ydAU9xpTupTY`
(07) todos `active= true`. Se algum vier `false`, RELIGUE imediatamente com
`.../workflows/{id}/activate` e pare.

- [ ] **Step 5: Limpar o script temporário**

```bash
rm -f /tmp/fase6-deactivate.mts
```

- [ ] **Step 6: Sem commit** (ação no n8n, fora do repo). Registre no relatório
  final que 02/04/05 estão `active=false` e 01/03/07 `active=true`.

**Rollback (se precisar religar):** trocar `deactivate` por `activate` no mesmo
endpoint para os 3 IDs 02/04/05.

---

### Task 7: Verificação final integrada

- [ ] **Step 1: Grep de resíduos — nenhuma referência viva ao caminho antigo**

Run: `grep -rn "business_opportunities\|n8n/agents\|/api/agents\|triggerBusiness\|triggerArticle\|triggerSocial" app/ lib/ components/ 2>/dev/null | grep -v "lib/n8n/mappers.ts" | grep -v "docs/"`
Expected: NENHUMA linha. (`mappers.ts` ainda DEFINE `mapBusinessOpportunities`/
`BusinessOpportunityRow`, mas ninguém importa — aceitável nesta fase; docs
podem citar.)

- [ ] **Step 2: Typecheck limpo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint sem regressões**

Run: `npx eslint app/api/opportunities lib/n8n/types.ts`
Expected: sem erros novos.

- [ ] **Step 4: Build (sanidade do App Router após remover rotas)**

Run: `npm run build`
Expected: build conclui; as rotas `/api/agents/*` NÃO aparecem mais na lista de
rotas; `/api/opportunities` e `/api/opportunities/[id]` aparecem.

- [ ] **Step 5: Sem commit** (verificação). Prosseguir para
  finishing-a-development-branch.

---

## Self-Review (autor do plano)

**Spec coverage:**
- Item 1 (reapontar lista) → Task 1. ✓
- Item 1b (reapontar detalhe `[id]`) → Task 2. ✓
- Item 2 (deletar `agents.ts`) → Task 3. ✓
- Item 3 (deletar `/api/agents/[agent]`) → Task 3. ✓
- Item 4 (deletar `/api/agents/executions`) → Task 3. ✓
- Item 5 (limpar `types.ts`) → Task 5. ✓
- Item 6 (desativar 02/04/05 no n8n) → Task 6. ✓
- Verificação do spec (tsc/eslint/grep/smoke/n8n status) → Tasks 4, 6, 7. ✓
- "Não tocar no Clone" → Task 6 Step 4 confirma 01/03/07 ativos. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo de código traz o código
completo; comandos com saída esperada explícita.

**Type consistency:** `AppOpportunityRow` idêntico em Task 1 e Task 2 (mesmos
campos/tipos). O objeto passado a `enrichWithConversation` usa `conversationId`
(campo que o genérico exige) em ambas. `N8nWebhookId` após Task 5 mantém só as
4 chaves referenciadas por `client.ts`/`poll-execution.ts`.

**Ordem:** Task 3 (deletar agents.ts) precede Task 5 (limpar types.ts) — correto,
senão o typecheck de agents.ts quebraria ao remover as chaves.
