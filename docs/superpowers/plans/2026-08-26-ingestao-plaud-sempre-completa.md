# Ingestão Plaud Sempre Completa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que TODAS as gravações do Plaud cheguem sempre ao banco (hoje faltam 75 de 300) e sejam processadas pela IA automaticamente, com tokens duráveis, reconciliação diária, sincronização manual pela UI, observabilidade, backfill e desativação do push Zapier.

**Architecture:** O app já tem ingestão pull-based idempotente (`lib/plaud/ingest.ts` + `POST /api/plaud/ingest`) que pagina o Plaud e faz upsert por `metadata->>'plaud_file_id'` em `meetings`/`summaries` — sem tocar em n8n, embeddings ou clone. O que quebrou em produção é o token: o Plaud ROTACIONA o `refresh_token` a cada refresh (validade 24h), e o storage atual (arquivo local `~/.plaud/tokens-mcp.json` ou env `PLAUD_REFRESH_TOKEN` com cache em memória) perde a rotação a cada restart/instância nova do Cloud Run (min-instances=0). Solução: mover o token set para `app_plaud_tokens` no Postgres com refresh single-flight (`SELECT ... FOR UPDATE`); extrair o loop de ingestão para `lib/plaud/ingest-all.ts` (`runFullIngest`), que registra cada execução em `app_ingest_runs` e, ao final, processa com IA todas as conversas pendentes (`lib/plaud/process-pending.ts`); expor duas portas de entrada: `POST /api/plaud/ingest` (guardada por segredo, para o Cloud Scheduler diário) e `POST /api/plaud/sync` (para o botão "Sincronizar com Plaud" na UI); rodar o backfill e desativar o Zap "Plaud → n8n" no Zapier (ação manual do usuário, workflow n8n intocado).

**Tech Stack:** Next.js App Router, TypeScript, `pg` (pool direto), Drizzle apenas para schema types, `tsx` para scripts de verificação (o projeto não tem framework de testes — o padrão do repo é script `tsx` auto-limpante com `node:assert/strict`, ver `docs/superpowers/plans/2026-08-24-plaud-ingest.md`).

**Root cause (investigado em 2026-08-26):** 75/300 gravações ausentes. Causas: (1) push Zapier→n8n cronicamente com perdas e hoje morto (nenhuma execução do workflow principal desde o backfill manual de 21/08; `max(meeting_date)`=2026-08-20); (2) sem retry/dead-letter no push; (3) sync tardio do gravador (gravações de 18–21/08 só apareceram no Plaud em 23/08 — push pontual perde); (4) rotação do refresh_token + Cloud Run stateless invalidou todas as cópias do token (Secret Manager e local retornam 403); (5) retenção curta de execuções no n8n impede auditoria.

**Restrições (do usuário):** não mexer no clone Andrezza, dados brutos do Plaud, embeddings/pgvector ou workflows n8n. A ingestão direta deposita apenas em `meetings`/`summaries` — **não gera embeddings**. A alimentação do clone com as gravações backfilled é um workstream separado, fora deste plano.

**Decisões do grill (2026-08-26):** (D1) o Zapier será desativado junto com o deploy — ação manual do usuário no painel do Zapier, Task 11; (D2) toda conversa ingerida com transcrição é processada automaticamente pela IA ao final de cada ingestão (`processTranscription` → `persistTranscriptionResult`), em vez de ficar "pendente" para sempre; (D3) a reconciliação agendada roda 1×/dia (05:00 America/Sao_Paulo) e a UI ganha um botão "Sincronizar com Plaud" para urgências.

---

## Nota sobre "testes"

Sem vitest/jest. Cada task usa script `tsx` de verificação contra o Supabase real (`scripts/verify/*.mts`), auto-limpante, ou verificação por comando (`npx tsc --noEmit`, `curl`, SQL). Segredos: `.env` NUNCA vai para o git; nunca imprimir o conteúdo de `app_plaud_tokens` nem de `/Users/wesleycardoso/Redpine/meetings_access` em logs/saída.

---

## File Structure

- **Create** `lib/plaud/token-store.ts` — storage durável do token set no Postgres com refresh single-flight. Única responsabilidade: dar um `access_token` válido.
- **Modify** `lib/plaud/tokens.ts` — vira uma casca fina que delega ao token-store (mantém a API pública `getAccessToken`, `PlaudAuthError`, `PLAUD_AUTH_CLIENT_MESSAGE` para não tocar nos call-sites).
- **Create** `lib/plaud/process-pending.ts` — processa com IA todas as conversas `pendente` com transcrição (mesmo pipeline de `POST /api/process`), tolerante a falhas individuais.
- **Create** `lib/plaud/run-log.ts` — persistência de `app_ingest_runs` (`startIngestRun`/`finishIngestRun`).
- **Create** `lib/plaud/ingest-all.ts` — `runFullIngest(trigger, maxPages?)`: pagina o Plaud, ingere cada arquivo, registra o run e dispara o processamento pendente. Compartilhado pela rota guardada e pela rota de sync da UI.
- **Modify** `app/api/plaud/ingest/route.ts` — vira casca fina: guard por segredo (`x-ingest-secret`) + `runFullIngest`.
- **Create** `app/api/plaud/sync/route.ts` — POST sem segredo (uso pela UI): `runFullIngest('manual')`.
- **Create** `components/SyncPlaudButton.tsx` — botão "Sincronizar com Plaud" (estado ocupado + resumo do resultado).
- **Modify** `app/conversas/page.tsx` — renderiza o `SyncPlaudButton` no cabeçalho e revalida a lista após sync.
- **Create** `app/api/plaud/ingest/status/route.ts` — GET: últimas execuções + contagem de gravações do Plaud ainda ausentes no banco (o "gap").
- **Create** `scripts/seed-plaud-tokens.mts` — semeia `app_plaud_tokens` a partir de `~/.plaud/tokens-mcp.json` (sessão MCP válida).
- **Create** `scripts/verify/token-store.mts`, `scripts/verify/process-pending.mts`, `scripts/verify/ingest-runs.mts` — verificações descartáveis.
- **SQL** aplicado via psql (sem drizzle-kit migrations no fluxo do repo): `app_plaud_tokens`, `app_ingest_runs`.

Nota: `lib/plaud/ingest.ts` NÃO muda — o status inicial continua `received` ("pendente" na view); é o processamento automático (D2) que promove a conversa a `processado`.

---

## Task 1: Tabelas `app_plaud_tokens` e `app_ingest_runs`

**Files:**
- Modify: `lib/db/schema.ts` (adicionar as duas tabelas no fim, antes de TYPE EXPORTS)
- SQL direto no banco (padrão do repo: DDL via psql)

- [ ] **Step 1: Aplicar o DDL no Supabase**

Executar (a connection string vem de `/Users/wesleycardoso/Redpine/meetings_access` — nunca imprimir):

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS app_plaud_tokens (
  id text PRIMARY KEY DEFAULT 'default',
  access_token text NOT NULL DEFAULT '',
  refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_ingest_runs (
  id text PRIMARY KEY,
  trigger text NOT NULL,               -- 'manual' | 'cron'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean,
  total integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  process_failed integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text
);
CREATE INDEX IF NOT EXISTS app_ingest_runs_started_idx ON app_ingest_runs (started_at DESC);
SQL
```

Expected: `CREATE TABLE` ×2, `CREATE INDEX`.

- [x] **Step 2: Declarar no schema.ts**

Adicionar em `lib/db/schema.ts`, após o bloco `ideaEnrichmentReference` (linha ~205) e antes de `// ===== TYPE EXPORTS =====`:

```ts
// ===== PLAUD TOKENS (app_plaud_tokens) =====
// Linha única (id='default'). O refresh_token do Plaud ROTACIONA a cada refresh
// (validade 24h) — por isso o token set vive no banco, não em env/arquivo.
export const plaudTokens = pgTable('app_plaud_tokens', {
  id: text('id').primaryKey().default('default'),
  accessToken: text('access_token').notNull().default(''),
  refreshToken: text('refresh_token').notNull(),
  tokenType: text('token_type').notNull().default('Bearer'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== INGEST RUNS (app_ingest_runs) =====
export const ingestRuns = pgTable('app_ingest_runs', {
  id: text('id').primaryKey(),
  trigger: text('trigger').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ok: boolean('ok'),
  total: integer('total').notNull().default(0),
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  processFailed: integer('process_failed').notNull().default(0),
  errors: text('errors'),
  errorMessage: text('error_message'),
}, (table) => [
  index('app_ingest_runs_started_idx').on(table.startedAt),
]);
```

E no bloco TYPE EXPORTS, ao final:

```ts
export type PlaudTokenRow = typeof plaudTokens.$inferSelect;
export type IngestRun = typeof ingestRuns.$inferSelect;
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [x] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: tabelas app_plaud_tokens e app_ingest_runs (schema)"
```

---

## Task 2: `lib/plaud/token-store.ts` — token durável com refresh single-flight

**Files:**
- Create: `lib/plaud/token-store.ts`
- Test: `scripts/verify/token-store.mts`

Contrato de refresh do Plaud (já validado no código atual `lib/plaud/tokens.ts:75-99`):
`POST https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh`, body form-urlencoded `refresh_token=...` → `{ access_token, refresh_token?, token_type, expires_in }`. O `refresh_token` retornado SUBSTITUI o anterior.

- [x] **Step 1: Write the failing verification script**

Create `scripts/verify/token-store.mts`:

```ts
import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { getStoredAccessToken, __testing } from '@/lib/plaud/token-store';

async function main() {
  // Prepara uma linha de teste com access_token válido e não expirado —
  // getStoredAccessToken NÃO deve chamar refresh nesse caso.
  await pool.query(
    `INSERT INTO app_plaud_tokens (id, access_token, refresh_token, expires_at)
     VALUES ('default', 'AT-valido', 'RT-1', now() + interval '1 hour')
     ON CONFLICT (id) DO UPDATE SET access_token='AT-valido', refresh_token='RT-1',
       expires_at=now() + interval '1 hour', updated_at=now()`
  );
  let calls = 0;
  __testing.setRefreshFn(async () => { calls++; throw new Error('não deveria chamar refresh'); });

  const t1 = await getStoredAccessToken();
  assert.equal(t1, 'AT-valido', 'deve usar o access_token do banco');
  assert.equal(calls, 0, 'não deve chamar refresh com token válido');

  // Expira o token: agora deve chamar refresh UMA vez, persistir rotação e devolver o novo.
  await pool.query(`UPDATE app_plaud_tokens SET expires_at = now() - interval '1 minute' WHERE id='default'`);
  __testing.setRefreshFn(async (rt) => {
    calls++;
    assert.equal(rt, 'RT-1', 'refresh deve usar o refresh_token do banco');
    return { access_token: 'AT-novo', refresh_token: 'RT-2', token_type: 'Bearer', expires_in: 3600 };
  });
  __testing.clearCache();
  const t2 = await getStoredAccessToken();
  assert.equal(t2, 'AT-novo');
  assert.equal(calls, 1, 'refresh exatamente uma vez');
  const row = (await pool.query(`SELECT access_token, refresh_token FROM app_plaud_tokens WHERE id='default'`)).rows[0];
  assert.equal(row.access_token, 'AT-novo', 'access_token persistido');
  assert.equal(row.refresh_token, 'RT-2', 'refresh_token ROTACIONADO persistido');

  // Concorrência: 5 chamadas simultâneas com token expirado → refresh 1 vez (single-flight via FOR UPDATE + re-check).
  await pool.query(`UPDATE app_plaud_tokens SET expires_at = now() - interval '1 minute' WHERE id='default'`);
  calls = 0;
  __testing.setRefreshFn(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 200));
    return { access_token: 'AT-3', refresh_token: 'RT-3', token_type: 'Bearer', expires_in: 3600 };
  });
  __testing.clearCache();
  const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => getStoredAccessToken()));
  assert.ok(tokens.every((t) => t === 'AT-3'), 'todas as chamadas recebem o token novo');
  assert.equal(calls, 1, 'apenas 1 refresh mesmo sob concorrência');

  await pool.query(`DELETE FROM app_plaud_tokens WHERE id='default'`);
  console.log('=== VERIFY token-store OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/tsx scripts/verify/token-store.mts`
Expected: FAIL — `Cannot find module '@/lib/plaud/token-store'`.

- [x] **Step 3: Implement `lib/plaud/token-store.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/tsx scripts/verify/token-store.mts`
Expected: `=== VERIFY token-store OK ===`

Nota: o teste de concorrência usa 5 promises no MESMO processo compartilhando o pool — o lock `FOR UPDATE` serializa nas conexões distintas do pool, então valida o caminho real.

- [ ] **Step 5: Commit**

```bash
git add lib/plaud/token-store.ts scripts/verify/token-store.mts
git commit -m "feat: token store durável do Plaud com refresh single-flight"
```

---

## Task 3: `lib/plaud/tokens.ts` delega ao banco (mantendo a API pública)

**Files:**
- Modify: `lib/plaud/tokens.ts`

`getAccessToken()` é chamado por `lib/plaud/client.ts`; `PlaudAuthError`/`PLAUD_AUTH_CLIENT_MESSAGE` são importados pelas rotas. Manter os três exports; trocar a implementação de `getAccessToken` para: banco primeiro; fallback para o comportamento atual (env/arquivo) apenas se a tabela estiver vazia — assim dev local continua funcionando antes do seed.

- [x] **Step 1: Editar `getAccessToken` em `lib/plaud/tokens.ts`**

Substituir a função exportada `getAccessToken` (linhas ~101-116) por:

```ts
/** Returns a valid access token, refreshing if it is expired or about to expire. */
export async function getAccessToken(): Promise<string> {
  // Fonte primária: token set durável no Postgres (sobrevive a restarts e
  // rotação do refresh_token). Fallback env/arquivo só quando o banco ainda
  // não foi semeado (dev local pré-seed).
  try {
    const { getStoredAccessToken } = await import('@/lib/plaud/token-store');
    return await getStoredAccessToken();
  } catch (e) {
    const emptyStore =
      e instanceof PlaudAuthError && e.message.includes('Nenhum token do Plaud no banco');
    if (!emptyStore) throw e;
  }
  let tokenSet = await readTokenSet();
  const expired = tokenSet.expires_at && Date.now() > tokenSet.expires_at - EXPIRY_SKEW_MS;
  if (!tokenSet.access_token || expired) {
    if (!tokenSet.refresh_token) {
      throw new PlaudAuthError('Token do Plaud expirado e sem refresh_token. Reautentique o MCP do Plaud.');
    }
    tokenSet = await refresh(tokenSet.refresh_token);
  }
  if (!tokenSet.access_token) {
    throw new PlaudAuthError('Token do Plaud ausente. Reautentique o MCP do Plaud.');
  }
  return tokenSet.access_token;
}
```

(O `import()` dinâmico evita ciclo de import: token-store importa `PlaudAuthError` deste arquivo.)

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/plaud/tokens.ts
git commit -m "feat: getAccessToken usa token store no banco com fallback local"
```

---

## Task 4: Seed do token a partir da sessão MCP válida

**Files:**
- Create: `scripts/seed-plaud-tokens.mts`

O MCP do Plaud nesta máquina ainda tem sessão válida (conta andreza.araujo@ehsbrasil.com). O seed lê `~/.plaud/tokens-mcp.json` e grava em `app_plaud_tokens`. Se o arquivo também estiver expirado, autenticar antes via tool `login` do MCP do Plaud (abre browser OAuth) e rodar o seed de novo.

- [x] **Step 1: Criar `scripts/seed-plaud-tokens.mts`**

```ts
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pool } from '@/lib/db';
import { saveTokenSet } from '@/lib/plaud/token-store';

const TOKEN_FILE = process.env.PLAUD_TOKEN_FILE || join(homedir(), '.plaud', 'tokens-mcp.json');

async function main() {
  const raw = await readFile(TOKEN_FILE, 'utf8');
  const t = JSON.parse(raw) as { access_token?: string; refresh_token?: string; token_type?: string; expires_at?: number };
  if (!t.refresh_token) throw new Error(`Sem refresh_token em ${TOKEN_FILE}. Rode o login do MCP do Plaud primeiro.`);
  await saveTokenSet({
    accessToken: t.access_token ?? '',
    refreshToken: t.refresh_token,
    tokenType: t.token_type ?? 'Bearer',
    expiresAt: t.expires_at ? new Date(t.expires_at) : null,
  });
  // Não imprimir tokens — só confirmação.
  console.log('app_plaud_tokens semeado a partir de', TOKEN_FILE);
  await pool.end();
}
main().catch(async (e) => { console.error('SEED FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
```

- [ ] **Step 2: Rodar o seed e validar com uma chamada real**

```bash
node_modules/.bin/tsx scripts/seed-plaud-tokens.mts
```
Expected: `app_plaud_tokens semeado a partir de ...`

Validação real (deve listar sem 401):

```bash
node_modules/.bin/tsx -e "import('dotenv/config').then(async()=>{const{listFiles}=await import('./lib/plaud/client');const r=await listFiles(1,1);console.log('OK, arquivos visíveis:', r.data.length);process.exit(0)})"
```
Expected: `OK, arquivos visíveis: 1`

Se falhar com 401: a sessão MCP também expirou — pedir ao usuário para autenticar via tool `login` do MCP do Plaud e repetir o Step 2.

- [x] **Step 3: Commit**

```bash
git add scripts/seed-plaud-tokens.mts
git commit -m "feat: seed de app_plaud_tokens a partir da sessão MCP"
```

---

## Task 5: Auto-processamento das conversas pendentes (D2)

Hoje `ingestPlaudFile` cria meetings com status `received` (= "pendente" na view) e nada os promove — ficam invisíveis para as análises (`status='processado'`). Decisão do grill: **processar automaticamente** com o mesmo pipeline de `POST /api/process` (ver `app/api/process/route.ts` como referência do fluxo: 'processando' → `processTranscription` → `persistTranscriptionResult` ou `markConversationError`). `lib/plaud/ingest.ts` NÃO muda.

**Files:**
- Create: `lib/plaud/process-pending.ts`
- Test: `scripts/verify/process-pending.mts`

- [x] **Step 1: Write the failing verification script**

Create `scripts/verify/process-pending.mts` (usa uma conversa sintética e injeta o processador — NUNCA processa conversas reais nem chama a IA de verdade; o filtro `ids` restringe ao registro de teste):

```ts
import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processPendingConversations, __testing } from '@/lib/plaud/process-pending';
import type { TranscriptionResult } from '@/lib/ai/prompts/process-transcription';

const FAKE_RESULT: TranscriptionResult = {
  summary: 'Resumo de teste',
  topics: ['teste'],
  participants: [],
  suggestedTitle: 'Título de teste',
  suggestedType: 'reuniao',
  opportunities: [],
  problems: [],
} as TranscriptionResult;

async function main() {
  const id = crypto.randomUUID();
  await db.insert(conversations).values({
    id,
    title: 'VERIFY process-pending',
    date: new Date(),
    type: 'reuniao',
    status: 'pendente',
    transcription: 'Transcrição sintética para o verify.',
    source: 'seed',
  });

  // Sucesso: pendente → processado, summary persistido.
  __testing.setProcessor(async () => ({ success: true, data: FAKE_RESULT }));
  const ok = await processPendingConversations({ ids: [id] });
  assert.equal(ok.processed, 1);
  assert.equal(ok.failed, 0);
  let [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  assert.equal(row.status, 'processado');
  assert.equal(row.summary, 'Resumo de teste');

  // Falha: volta para pendente, processador falha → erro, e a função NÃO lança.
  await db.update(conversations).set({ status: 'pendente' }).where(eq(conversations.id, id));
  __testing.setProcessor(async () => ({ success: false, error: { type: 'api_error', message: 'boom' } }));
  const fail = await processPendingConversations({ ids: [id] });
  assert.equal(fail.processed, 0);
  assert.equal(fail.failed, 1);
  [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  assert.equal(row.status, 'erro');

  __testing.reset();
  await db.delete(conversations).where(eq(conversations.id, id));
  console.log('=== VERIFY process-pending OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
```

Nota: se o shape de `TranscriptionResult` ou do erro de `ProcessTranscriptionResponse` divergir do stub acima, ajustar o stub aos tipos reais de `lib/ai/services/transcription-processor.ts` / `lib/ai/prompts/process-transcription.ts` (o typecheck acusa).

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/tsx scripts/verify/process-pending.mts`
Expected: FAIL — `Cannot find module '@/lib/plaud/process-pending'`.

- [x] **Step 3: Implement `lib/plaud/process-pending.ts`**

```ts
// Processa com IA as conversas que a ingestão deixou como 'pendente'
// (status 'received' em meetings). Mesmo pipeline de POST /api/process:
// 'processando' → processTranscription → persistTranscriptionResult /
// markConversationError. Falha individual NÃO derruba o lote — a conversa
// fica 'erro' e o loop continua (a reconciliação seguinte pode re-tentar
// manualmente via POST /api/process).

import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';

export interface ProcessPendingSummary {
  processed: number;
  failed: number;
}

type Processor = typeof processTranscription;
let processor: Processor = processTranscription;

export async function processPendingConversations(
  options?: { limit?: number; ids?: string[] }
): Promise<ProcessPendingSummary> {
  const filters = [eq(conversations.status, 'pendente'), isNotNull(conversations.transcription)];
  if (options?.ids?.length) filters.push(inArray(conversations.id, options.ids));

  const pending = await db
    .select({ id: conversations.id, title: conversations.title, transcription: conversations.transcription })
    .from(conversations)
    .where(and(...filters))
    .orderBy(asc(conversations.date))
    .limit(options?.limit ?? 500);

  const summary: ProcessPendingSummary = { processed: 0, failed: 0 };
  for (const conv of pending) {
    if (!conv.transcription) continue;
    try {
      await db.update(conversations).set({ status: 'processando' }).where(eq(conversations.id, conv.id));
      const result = await processor(conv.transcription);
      if (!result.success) {
        await markConversationError(conv.id);
        summary.failed += 1;
        console.error('[process-pending] IA falhou para', conv.id, result.error);
        continue;
      }
      await persistTranscriptionResult(conv.id, result.data, conv.title);
      summary.processed += 1;
    } catch (e) {
      await markConversationError(conv.id).catch(() => {});
      summary.failed += 1;
      console.error('[process-pending] erro em', conv.id, e);
    }
  }
  return summary;
}

// Só para scripts de verificação (injeta o processador para não chamar a IA real).
export const __testing = {
  setProcessor(fn: Processor) { processor = fn; },
  reset() { processor = processTranscription; },
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/tsx scripts/verify/process-pending.mts`
Expected: `=== VERIFY process-pending OK ===`

- [x] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/plaud/process-pending.ts scripts/verify/process-pending.mts
git commit -m "feat: auto-processamento IA das conversas pendentes"
```

---

## Task 6: `runFullIngest` compartilhado + run-log + guard na rota

Extrai o loop de paginação de `app/api/plaud/ingest/route.ts` para `lib/plaud/ingest-all.ts`, integrando o log de execuções (`lib/plaud/run-log.ts`) e o auto-processamento (Task 5). A rota vira casca fina com guard por segredo.

**Files:**
- Create: `lib/plaud/run-log.ts`
- Create: `lib/plaud/ingest-all.ts`
- Modify: `app/api/plaud/ingest/route.ts` (substituir o arquivo inteiro)
- Test: `scripts/verify/ingest-runs.mts`
- Modify: `.env` (adicionar `INGEST_CRON_SECRET=<gerar com openssl rand -hex 32>`) — NUNCA commitar.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify/ingest-runs.mts` (testa só a camada de persistência de runs, sem bater no Plaud):

```ts
import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { startIngestRun, finishIngestRun } from '@/lib/plaud/run-log';

async function main() {
  const id = await startIngestRun('manual');
  assert.ok(id, 'deve devolver id do run');
  await finishIngestRun(id, {
    ok: true,
    summary: { total: 3, created: 1, updated: 1, skipped: 1, errors: [{ fileId: 'x', message: 'boom' }] },
    processing: { processed: 1, failed: 0 },
  });
  const row = (await pool.query(`SELECT * FROM app_ingest_runs WHERE id=$1`, [id])).rows[0];
  assert.equal(row.ok, true);
  assert.equal(row.total, 3);
  assert.equal(row.created, 1);
  assert.equal(row.processed, 1);
  assert.equal(row.process_failed, 0);
  assert.ok(row.finished_at, 'finished_at preenchido');
  assert.equal(JSON.parse(JSON.stringify(row.errors))[0].fileId, 'x');
  await pool.query(`DELETE FROM app_ingest_runs WHERE id=$1`, [id]);
  console.log('=== VERIFY ingest-runs OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
```

Run: `node_modules/.bin/tsx scripts/verify/ingest-runs.mts`
Expected: FAIL — módulo `@/lib/plaud/run-log` não existe.

- [ ] **Step 2: Criar `lib/plaud/run-log.ts`**

```ts
import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';

export interface IngestSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { fileId: string; message: string }[];
}

export async function startIngestRun(trigger: 'manual' | 'cron'): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO app_ingest_runs (id, trigger) VALUES ($1, $2)`, [id, trigger]);
  return id;
}

export async function finishIngestRun(
  id: string,
  result: {
    ok: boolean;
    summary: IngestSummary;
    processing?: { processed: number; failed: number };
    errorMessage?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE app_ingest_runs
        SET finished_at=now(), ok=$2, total=$3, created=$4, updated=$5, skipped=$6,
            processed=$7, process_failed=$8, errors=$9::jsonb, error_message=$10
      WHERE id=$1`,
    [id, result.ok, result.summary.total, result.summary.created, result.summary.updated,
     result.summary.skipped, result.processing?.processed ?? 0, result.processing?.failed ?? 0,
     JSON.stringify(result.summary.errors), result.errorMessage ?? null]
  );
}
```

Run: `node_modules/.bin/tsx scripts/verify/ingest-runs.mts`
Expected: `=== VERIFY ingest-runs OK ===`

- [x] **Step 3: Criar `lib/plaud/ingest-all.ts`**

```ts
// Varredura completa do Plaud: pagina listFiles, ingere cada gravação
// (idempotente), registra a execução em app_ingest_runs e, ao final,
// processa com IA as conversas que ficaram pendentes (D2).
// Compartilhado por POST /api/plaud/ingest (cron, com segredo) e
// POST /api/plaud/sync (botão da UI).

import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError } from '@/lib/plaud/tokens';
import { ingestPlaudFile } from '@/lib/plaud/ingest';
import { processPendingConversations, type ProcessPendingSummary } from '@/lib/plaud/process-pending';
import { startIngestRun, finishIngestRun, type IngestSummary } from '@/lib/plaud/run-log';

export interface FullIngestResult {
  ingest: IngestSummary;
  processing: ProcessPendingSummary;
}

/** Erro com o resumo parcial da varredura (para a rota devolver `partial`). */
export class IngestRunError extends Error {
  constructor(message: string, readonly partial: IngestSummary, readonly cause?: unknown) {
    super(message);
    this.name = 'IngestRunError';
  }
}

export async function runFullIngest(trigger: 'manual' | 'cron', maxPages?: number): Promise<FullIngestResult> {
  const runId = await startIngestRun(trigger);
  const summary: IngestSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
  const pageSize = 50;

  try {
    let page = 1;
    while (true) {
      if (maxPages && page > maxPages) break;
      const { data } = await listFiles(page, pageSize);
      if (!data.length) break;

      for (const file of data) {
        summary.total += 1;
        try {
          const r = await ingestPlaudFile(file.id);
          if (r.outcome === 'created') summary.created += 1;
          else if (r.outcome === 'updated') summary.updated += 1;
          else summary.skipped += 1;
        } catch (e) {
          // Auth falhou no meio do lote: vai falhar para todos os próximos. Aborta.
          if (e instanceof PlaudAuthError) throw e;
          summary.errors.push({ fileId: file.id, message: e instanceof Error ? e.message : String(e) });
        }
      }

      if (data.length < pageSize) break; // última página
      page += 1;
    }

    const processing = await processPendingConversations();
    await finishIngestRun(runId, { ok: summary.errors.length === 0, summary, processing });
    return { ingest: summary, processing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishIngestRun(runId, { ok: false, summary, errorMessage: message }).catch(() => {});
    throw new IngestRunError(message, summary, error);
  }
}
```

- [x] **Step 4: Substituir `app/api/plaud/ingest/route.ts` inteiro**

```ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { runFullIngest, IngestRunError } from '@/lib/plaud/ingest-all';

const bodySchema = z.object({
  maxPages: z.number().int().positive().max(1000).optional(),
}).optional();

/**
 * Ingestão em lote (cron/operador): varre listFiles (paginado), deposita cada
 * gravação em meetings/summaries via ingestPlaudFile (idempotente) e processa
 * com IA as conversas pendentes ao final. Protegida por INGEST_CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  // Guard: a rota varre o Plaud inteiro — só o operador/cron pode disparar.
  const secret = process.env.INGEST_CRON_SECRET;
  const provided = request.headers.get('x-ingest-secret');
  if (secret && provided !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const trigger: 'manual' | 'cron' = request.headers.get('x-ingest-trigger') === 'cron' ? 'cron' : 'manual';

  let maxPages: number | undefined;
  try {
    const raw = await request.json().catch(() => ({}));
    maxPages = bodySchema.parse(raw)?.maxPages;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })) },
        { status: 400 }
      );
    }
    throw error; // não-Zod: deixa o handler externo tratar (não engolir silenciosamente)
  }

  try {
    const result = await runFullIngest(trigger, maxPages);
    return Response.json({ data: result });
  } catch (error) {
    const cause = error instanceof IngestRunError ? error.cause : error;
    if (cause instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/ingest auth error:', cause);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/ingest error:', error);
    return Response.json(
      { error: 'Internal server error', partial: error instanceof IngestRunError ? error.partial : undefined },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Typecheck + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/plaud/run-log.ts lib/plaud/ingest-all.ts app/api/plaud/ingest/route.ts scripts/verify/ingest-runs.mts
git commit -m "feat: runFullIngest compartilhado com run-log, auto-processamento e guard"
```

---

## Task 7: `POST /api/plaud/sync` + botão "Sincronizar com Plaud" na UI (D3)

Sincronização manual para urgências ("preciso da conversa de hoje agora"). O segredo do cron NUNCA vai para o client — por isso uma rota separada, sem guard, que só chama `runFullIngest('manual')` (a operação é idempotente e somente-leitura no Plaud; o pior caso de abuso é custo de IA nas pendentes, aceitável no contexto single-tenant do app, que não tem autenticação em nenhuma rota).

**Files:**
- Create: `app/api/plaud/sync/route.ts`
- Create: `components/SyncPlaudButton.tsx`
- Modify: `app/conversas/page.tsx` (renderizar o botão no cabeçalho)

- [x] **Step 1: Criar `app/api/plaud/sync/route.ts`**

```ts
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { runFullIngest, IngestRunError } from '@/lib/plaud/ingest-all';

/**
 * Sincronização manual disparada pelo botão da UI. Mesma varredura da rota
 * de ingestão, sem segredo (o segredo do cron não pode ir para o client).
 */
export async function POST() {
  try {
    const result = await runFullIngest('manual');
    return Response.json({ data: result });
  } catch (error) {
    const cause = error instanceof IngestRunError ? error.cause : error;
    if (cause instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/sync auth error:', cause);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/sync error:', error);
    return Response.json(
      { error: 'Internal server error', partial: error instanceof IngestRunError ? error.partial : undefined },
      { status: 500 }
    );
  }
}
```

- [x] **Step 2: Criar `components/SyncPlaudButton.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ds";

/**
 * Botão "Sincronizar com Plaud": dispara POST /api/plaud/sync (varredura
 * completa + auto-processamento) e mostra o resumo do resultado.
 */
export function SyncPlaudButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/plaud/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na sincronização");
      const { ingest, processing } = json.data;
      setMsg(`Novas: ${ingest.created} · Atualizadas: ${ingest.updated} · Processadas: ${processing.processed}` +
        (processing.failed ? ` · Falhas IA: ${processing.failed}` : ""));
      onDone?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button onClick={run} disabled={busy}>
        {busy ? "Sincronizando…" : "Sincronizar com Plaud"}
      </Button>
      {msg ? (
        <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{msg}</span>
      ) : null}
    </span>
  );
}
```

Nota de integração: usar o `Button` de `@/components/ds` com as MESMAS props/variant dos botões vizinhos do cabeçalho de `app/conversas/page.tsx` (ex.: o botão que abre o `UploadModal`) — copiar o padrão local em vez de inventar estilo novo.

- [x] **Step 3: Renderizar em `app/conversas/page.tsx`**

Importar no topo:

```tsx
import { SyncPlaudButton } from "@/components/SyncPlaudButton";
```

No cabeçalho da página (o bloco onde ficam os botões de Upload/Drive), adicionar ao lado deles:

```tsx
<SyncPlaudButton onDone={() => mutate()} />
```

(`mutate` é o do `useSWR` da listagem, já disponível no componente — revalida a lista após o sync. A varredura completa pode levar alguns minutos na primeira execução; o botão fica desabilitado com "Sincronizando…" enquanto isso.)

- [ ] **Step 4: Verificar localmente**

```bash
npm run dev &
sleep 5
curl -s -X POST http://localhost:3000/api/plaud/sync -m 1200 | python3 -m json.tool | head -20
```
Expected: JSON `data.ingest` com contadores e `data.processing` com `processed`/`failed`. Na UI (`http://localhost:3000/conversas`), o botão aparece e mostra o resumo ao terminar.

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/plaud/sync/route.ts components/SyncPlaudButton.tsx app/conversas/page.tsx
git commit -m "feat: sincronização manual com Plaud pela UI"
```

---

## Task 8: `GET /api/plaud/ingest/status` — gap e últimas execuções

**Files:**
- Create: `app/api/plaud/ingest/status/route.ts`

- [x] **Step 1: Implementar a rota**

```ts
import { pool } from '@/lib/db';
import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';

/**
 * Observabilidade da ingestão: quantas gravações existem no Plaud, quantas já
 * estão no banco, quais faltam (o "gap" que deveria ser sempre 0) e as últimas
 * execuções de ingestão.
 */
export async function GET() {
  try {
    // IDs no Plaud (paginado).
    const plaudIds = new Set<string>();
    let page = 1;
    const pageSize = 50;
    while (true) {
      const { data } = await listFiles(page, pageSize);
      for (const f of data) plaudIds.add(f.id);
      if (data.length < pageSize) break;
      page += 1;
    }

    // IDs já no banco.
    const dbRes = await pool.query<{ pf: string }>(
      `SELECT metadata->>'plaud_file_id' AS pf FROM meetings WHERE metadata->>'plaud_file_id' IS NOT NULL`
    );
    const dbIds = new Set(dbRes.rows.map((r) => r.pf));
    const missing = [...plaudIds].filter((id) => !dbIds.has(id));

    const runs = await pool.query(
      `SELECT id, trigger, started_at, finished_at, ok, total, created, updated, skipped,
              processed, process_failed, jsonb_array_length(errors) AS error_count, error_message
         FROM app_ingest_runs ORDER BY started_at DESC LIMIT 10`
    );

    return Response.json({
      data: {
        plaudTotal: plaudIds.size,
        inDatabase: dbIds.size,
        missingCount: missing.length,
        missingIds: missing,
        lastRuns: runs.rows,
      },
    });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      console.error('[API] GET /api/plaud/ingest/status auth error:', error);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] GET /api/plaud/ingest/status error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar localmente**

```bash
npm run dev &
sleep 5
curl -s http://localhost:3000/api/plaud/ingest/status | python3 -m json.tool | head -20
```
Expected: JSON com `plaudTotal` ≈ 300, `inDatabase` ≈ 225, `missingCount` ≈ 75 (antes do backfill).

- [x] **Step 3: Commit**

```bash
git add app/api/plaud/ingest/status/route.ts
git commit -m "feat: endpoint de status da ingestão Plaud (gap + últimas execuções)"
```

---

## Task 9: Backfill das 75 gravações ausentes

Sem código novo — é operar o que foi construído. Rodar com `.env` local (o banco já é o Supabase de produção). Atenção: com o auto-processamento (D2), este backfill dispara ~75 chamadas de IA em sequência — pode levar bastante tempo e consumir crédito Anthropic; é o comportamento decidido.

- [ ] **Step 1: Disparar a ingestão completa**

```bash
curl -s -X POST http://localhost:3000/api/plaud/ingest \
  -H "x-ingest-secret: $INGEST_CRON_SECRET" \
  -H 'Content-Type: application/json' -d '{}' -m 3600 | python3 -m json.tool
```
Expected: `data.ingest.created` ≈ 75, `data.ingest.skipped` ≈ 225, `errors` vazio; `data.processing.processed` ≈ 75 (menos eventuais gravações sem transcrição, que aparecem como `skipped`/não-processadas — conferir no Step 2) e `data.processing.failed` = 0.

- [ ] **Step 2: Conferir o gap zerado**

```bash
curl -s http://localhost:3000/api/plaud/ingest/status | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('plaud:', d['plaudTotal'], 'db:', d['inDatabase'], 'faltando:', d['missingCount'])"
```
Expected: `faltando: 0` (ou apenas os IDs sem transcrição no Plaud — listar e reportar ao usuário quais são e por quê).

- [ ] **Step 3: Conferência SQL de sanidade**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" -c "SELECT status, count(*) FROM conversations GROUP BY 1; SELECT max(meeting_date) FROM meetings;"
```
Expected: `max(meeting_date)` >= data da gravação mais recente do Plaud; os meetings backfilled aparecem na view como `processado` (na tabela `meetings`, isso corresponde a `summarized`); `pendente` apenas para gravações sem transcrição; `erro` = 0 (se houver, re-tentar via `POST /api/process` com o `conversationId`).

---

## Task 10: Agendamento diário da reconciliação (D3)

O deploy é via GitHub Actions (`.github/workflows/deploy.yml`) para o Cloud Run `plaudgoldminer` (projeto `plaudgoldminersistema`, us-central1). Agendar um Cloud Scheduler chamando a rota de ingestão **uma vez ao dia, às 05:00 (America/Sao_Paulo)** — urgências intra-dia usam o botão "Sincronizar com Plaud" da Task 7.

- [ ] **Step 1: Colocar `INGEST_CRON_SECRET` no serviço**

```bash
gcloud secrets create ingest-cron-secret --project=plaudgoldminersistema --data-file=<(printf '%s' "$INGEST_CRON_SECRET") 2>/dev/null || \
gcloud secrets versions add ingest-cron-secret --project=plaudgoldminersistema --data-file=<(printf '%s' "$INGEST_CRON_SECRET")
gcloud run services update plaudgoldminer --project=plaudgoldminersistema --region=us-central1 \
  --update-secrets=INGEST_CRON_SECRET=ingest-cron-secret:latest
```

- [ ] **Step 2: Criar o job do Scheduler**

```bash
SERVICE_URL=$(gcloud run services describe plaudgoldminer --project=plaudgoldminersistema --region=us-central1 --format='value(status.url)')
gcloud scheduler jobs create http plaud-ingest-reconcile \
  --project=plaudgoldminersistema --location=us-central1 \
  --schedule="0 5 * * *" --time-zone="America/Sao_Paulo" \
  --uri="${SERVICE_URL}/api/plaud/ingest" --http-method=POST \
  --headers="x-ingest-secret=${INGEST_CRON_SECRET},x-ingest-trigger=cron,Content-Type=application/json" \
  --message-body='{}' --attempt-deadline=1800s
```

Nota: `attempt-deadline` de 30 min porque a varredura pagina ~300 arquivos e o auto-processamento chama IA nas pendentes. Se a rota estourar timeout do Cloud Run, reexecuções seguintes são baratas (idempotente, quase tudo `skipped`; pendentes remanescentes são processadas no run seguinte ou via botão de sync).

- [ ] **Step 3: Testar o job**

```bash
gcloud scheduler jobs run plaud-ingest-reconcile --project=plaudgoldminersistema --location=us-central1
sleep 60
curl -s "${SERVICE_URL}/api/plaud/ingest/status" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('faltando:', d['missingCount']); print(d['lastRuns'][0])"
```
Expected: último run com `trigger='cron'`, `ok=true`, `faltando: 0`.

Pré-requisito de deploy: fazer o deploy do código das Tasks 1-8 ANTES desta task (push na branch que o `deploy.yml` observa). O token em produção vem do banco (Task 4 já semeou — o banco é o mesmo Supabase).

---

## Task 11: Desativar o Zap "Plaud → n8n" no Zapier (D1 — ação manual do usuário)

Decisão do grill: o push via Zapier é desativado junto com o deploy — a reconciliação pull passa a ser o ÚNICO mecanismo de entrada de gravações do Plaud. O workflow do n8n NÃO é tocado (restrição); apenas o Zap deixa de dispará-lo. Esta task é uma AÇÃO HUMANA no painel do Zapier — o agente não tem acesso; pedir ao usuário e registrar a confirmação.

Pré-requisitos: Task 10 concluída E pelo menos um run de cron com `ok=true` e `missingCount=0` (Step 3 da Task 10).

- [ ] **Step 1: Pedir ao usuário para desligar o Zap**

Instrução para o usuário: acessar zapier.com → My Zaps → localizar o Zap que envia gravações do Plaud para o webhook do n8n ("Plaud → n8n") → alternar o toggle para **Off** (não excluir — manter desligado para eventual rollback).

- [ ] **Step 2: Confirmar que a entrada continua íntegra sem o push**

No dia seguinte ao desligamento (após o cron das 05:00):

```bash
curl -s "${SERVICE_URL}/api/plaud/ingest/status" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('faltando:', d['missingCount']); print(d['lastRuns'][0])"
```
Expected: `faltando: 0` e último run `ok=true` — o pull sozinho cobre a entrada.

- [ ] **Step 3: Registrar a data do desligamento**

Anotar no PR/commit final (mensagem ou descrição): "Zap Plaud→n8n desligado em <data> pelo usuário; entrada de gravações passa a ser exclusivamente a reconciliação pull diária + sync manual."

---

## Task 12: Verificação final

- [ ] **Step 1:** `npx tsc --noEmit && npm run build` — sem erros.
- [ ] **Step 2:** `curl -s $SERVICE_URL/api/plaud/ingest/status` → `missingCount: 0` em produção.
- [ ] **Step 3:** Na UI de produção, clicar em "Sincronizar com Plaud" → termina com resumo (tudo `skipped`, `processed: 0`) e a lista revalida.
- [ ] **Step 4:** Conferir que nenhum segredo vazou: `git log -p --all | grep -c "postgresql://"` deve ser `0`; `.env` fora do git (`git check-ignore .env` → `.env`).
- [ ] **Step 5:** Remover scripts de verificação descartáveis:

```bash
git rm scripts/verify/token-store.mts scripts/verify/process-pending.mts scripts/verify/ingest-runs.mts
git commit -m "chore: remove scripts de verificação descartáveis"
```

---

## Fora do escopo (decisões do usuário, registradas)

1. **Embeddings/clone:** as gravações backfilled NÃO entram no pgvector (pipeline n8n intocado, conforme restrição). A alimentação do clone é um workstream separado, a ser planejado depois com o usuário.
2. **Alerta ativo (e-mail/Slack) quando `missingCount > 0` ou run falho:** melhoria futura simples em cima de `app_ingest_runs`.
