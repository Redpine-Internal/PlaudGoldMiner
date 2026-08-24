# Plaud Ingest (Fase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depositar gravações do Plaud direto em `meetings`/`summaries` no Supabase (idempotente por `plaud_file_id`), sem rodar IA, expondo uma rota POST de lote manual.

**Architecture:** Uma função pura de domínio `ingestPlaudFile(fileId)` que lê do Plaud (`getFileContent`, já existe) e faz upsert condicional por conteúdo nas tabelas base `meetings`/`summaries` (não na view `conversations`). Uma rota `POST /api/plaud/ingest` que pagina `listFiles` e agrega os resultados. Sem flag, sem cron, sem n8n.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle (`drizzle-orm/node-postgres`) + `pg`, Zod, `tsx` para scripts de verificação (o projeto não tem framework de testes; o padrão do repo é verificação por script `tsx` contra o cloud, auto-limpante).

**Spec:** `docs/superpowers/specs/2026-08-24-plaud-ingest-design.md`

---

## Nota sobre "testes"

O projeto **não tem** vitest/jest. O padrão estabelecido (usado e validado na Fase 1) é
um script `tsx` de verificação que roda contra o Supabase real, com asserts via
`node:assert/strict`, e **remove seu próprio meeting de teste no final**. Cada task
segue esse padrão: escreve o script de verificação (falha), implementa, roda (passa).

Os scripts de verificação vivem em `scripts/verify/` e são descartáveis — a Task final
os remove. Eles usam um `fileId` de teste que **não** existe no Plaud real, então
mockamos o `getFileContent` por injeção de dependência (ver Task 1: a função aceita um
segundo parâmetro opcional `deps` para o fetch do Plaud; default = o client real).

Como não há git neste worktree além do que já foi inicializado na sessão, os passos de
commit usam `git add <arquivos> && git commit`. Se o executor estiver num worktree
isolado sem git, pode pular os commits — não são pré-requisito das etapas seguintes.

---

## File Structure

- **Create** `lib/plaud/ingest.ts` — `ingestPlaudFile(fileId, deps?)`: upsert condicional
  por conteúdo em `meetings`/`summaries`. Única responsabilidade: depositar 1 arquivo.
- **Create** `app/api/plaud/ingest/route.ts` — `POST`: pagina `listFiles`, chama
  `ingestPlaudFile` por item, agrega `{ total, created, updated, skipped, errors }`.
- **Create** `scripts/verify/ingest-one.mts` — verificação da função (created/skipped/
  updated/sem-transcrição), auto-limpante. Descartável.
- **Reuse (no change)** `lib/plaud/client.ts` (`getFileContent`, `listFiles`, `PlaudFile`),
  `lib/plaud/tokens.ts` (`PlaudAuthError`), `lib/db/index.ts` (`db`, `pool`),
  `lib/db/schema.ts`.

---

## Task 1: `ingestPlaudFile` — deposita 1 arquivo (upsert condicional)

**Files:**
- Create: `lib/plaud/ingest.ts`
- Test: `scripts/verify/ingest-one.mts`

**Contexto de tipos (do código existente):**
- `getFileContent(id)` retorna `{ file: PlaudFileDetail; transcript: string; summary: string; topics: string[] }`.
- `PlaudFileDetail` tem `name: string`, `start_at: string`, `created_at: string`, `duration: number`.
- `meetings` (cloud): `id uuid`, `title text`, `transcription text NOT NULL`,
  `transcription_length int`, `meeting_date date`, `participants jsonb`, `source text`,
  `status text` (constraint: `received|processing|summarized|error`), `metadata jsonb`,
  `created_at/updated_at timestamptz`.
- `summaries`: `meeting_id uuid FK CASCADE`, `summary_text text NOT NULL`, `created_at`.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify/ingest-one.mts`:

```ts
import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { ingestPlaudFile, type IngestDeps } from '@/lib/plaud/ingest';

// fileId de teste — NÃO existe no Plaud real; injetamos deps mock.
const FILE_ID = 'ffffffffffffffffffffffffffffffff';

function makeDeps(over: Partial<{ transcript: string; summary: string; name: string; topics: string[] }>): IngestDeps {
  return {
    getFileContent: async () => ({
      file: { id: FILE_ID, name: over.name ?? 'Reunião Teste', created_at: '2026-01-10T12:00:00Z', start_at: '2026-01-10T12:00:00Z', duration: 720000 },
      transcript: over.transcript ?? 'transcrição integral de teste',
      summary: over.summary ?? 'resumo de teste',
      topics: over.topics ?? ['tópico A', 'tópico B'],
    }),
  };
}

async function cleanup() {
  await pool.query(`DELETE FROM meetings WHERE metadata->>'plaud_file_id' = $1`, [FILE_ID]);
}

async function main() {
  await cleanup();

  // 1) created
  let r = await ingestPlaudFile(FILE_ID, makeDeps({}));
  assert.equal(r.outcome, 'created', 'primeira ingestão deve criar');
  let m = (await pool.query(`SELECT status, transcription, transcription_length, metadata->>'plaud_file_id' pf FROM meetings WHERE id=$1`, [r.meetingId])).rows[0];
  assert.equal(m.status, 'received', 'status deve ser received');
  assert.equal(m.pf, FILE_ID, 'plaud_file_id deve estar no metadata');
  assert.equal(m.transcription_length, 'transcrição integral de teste'.length, 'length deve bater');
  let s = (await pool.query(`SELECT summary_text FROM summaries WHERE meeting_id=$1`, [r.meetingId])).rows;
  assert.equal(s.length, 1, 'deve ter 1 summary');
  const createdUpdatedAt = (await pool.query(`SELECT updated_at FROM meetings WHERE id=$1`, [r.meetingId])).rows[0].updated_at;

  // 2) skipped — mesmo conteúdo, nenhum write
  await new Promise((res) => setTimeout(res, 1100)); // garante que updated_at mudaria se houvesse write
  r = await ingestPlaudFile(FILE_ID, makeDeps({}));
  assert.equal(r.outcome, 'skipped', 'conteúdo idêntico deve pular');
  const afterSkip = (await pool.query(`SELECT updated_at FROM meetings WHERE id=$1`, [r.meetingId])).rows[0].updated_at;
  assert.equal(new Date(afterSkip).getTime(), new Date(createdUpdatedAt).getTime(), 'skip não deve tocar updated_at');

  // 3) updated — transcript mudou, status preservado
  await pool.query(`UPDATE meetings SET status='summarized' WHERE metadata->>'plaud_file_id'=$1`, [FILE_ID]);
  r = await ingestPlaudFile(FILE_ID, makeDeps({ transcript: 'nova transcrição corrigida' }));
  assert.equal(r.outcome, 'updated', 'conteúdo alterado deve atualizar');
  m = (await pool.query(`SELECT status, transcription FROM meetings WHERE id=$1`, [r.meetingId])).rows[0];
  assert.equal(m.status, 'summarized', 'update NÃO deve resetar status');
  assert.equal(m.transcription, 'nova transcrição corrigida', 'transcrição deve refletir a mudança');

  // 4) sem transcrição — skipped com reason
  await cleanup();
  r = await ingestPlaudFile(FILE_ID, makeDeps({ transcript: '' }));
  assert.equal(r.outcome, 'skipped', 'sem transcrição deve pular');
  assert.equal(r.reason, 'sem transcrição', 'reason deve explicar');
  const none = (await pool.query(`SELECT count(*)::int n FROM meetings WHERE metadata->>'plaud_file_id'=$1`, [FILE_ID])).rows[0].n;
  assert.equal(none, 0, 'nada deve ter sido criado');

  await cleanup();
  console.log('=== VERIFY ingest-one OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/tsx scripts/verify/ingest-one.mts`
Expected: FAIL — `Cannot find module '@/lib/plaud/ingest'` (ainda não existe).

- [ ] **Step 3: Implement `lib/plaud/ingest.ts`**

```ts
import { pool } from '@/lib/db';
import { getFileContent } from '@/lib/plaud/client';

export type IngestOutcome = 'created' | 'updated' | 'skipped';

export interface IngestResult {
  fileId: string;
  meetingId: string;
  outcome: IngestOutcome;
  reason?: string;
}

// Injeção de dependência para testar sem bater no Plaud real.
export interface IngestDeps {
  getFileContent: typeof getFileContent;
}
const defaultDeps: IngestDeps = { getFileContent };

/** Data do Plaud -> 'YYYY-MM-DD' (coluna meetings.meeting_date é DATE). null se inválida. */
function toDateOnly(...candidates: string[]): string | null {
  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Deposita UMA gravação do Plaud em meetings/summaries. Idempotente por
 * metadata->>'plaud_file_id': cria se novo, atualiza só se o conteúdo do Plaud
 * mudou (preservando status), pula se idêntico. NÃO roda IA.
 */
export async function ingestPlaudFile(
  fileId: string,
  deps: IngestDeps = defaultDeps
): Promise<IngestResult> {
  const { file, transcript, summary, topics } = await deps.getFileContent(fileId);

  if (!transcript || transcript.trim().length === 0) {
    return { fileId, meetingId: '', outcome: 'skipped', reason: 'sem transcrição' };
  }

  const title = file.name || 'Conversa do Plaud';
  const meetingDate = toDateOnly(file.start_at || '', file.created_at || '');
  const topicsJson = topics.length ? JSON.stringify(topics) : null;
  const cleanSummary = (summary || '').trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT m.id, m.title, m.transcription, m.meeting_date::text AS meeting_date,
              s.summary_text
         FROM meetings m
         LEFT JOIN LATERAL (
           SELECT summary_text FROM summaries s2
           WHERE s2.meeting_id = m.id ORDER BY s2.created_at DESC LIMIT 1
         ) s ON true
        WHERE m.metadata->>'plaud_file_id' = $1
        LIMIT 1`,
      [fileId]
    );

    if (existing.rowCount === 0) {
      // CREATE
      const ins = await client.query(
        `INSERT INTO meetings
           (title, transcription, transcription_length, meeting_date, participants,
            source, status, metadata)
         VALUES ($1,$2,$3,$4,'[]'::jsonb,'plaud','received',
            jsonb_strip_nulls(jsonb_build_object(
              'plaud_file_id',$5,'duration',$6,'type','reuniao','topics',$7::jsonb)))
         RETURNING id`,
        [title, transcript, transcript.length, meetingDate, fileId,
         String(file.duration ?? ''), topicsJson]
      );
      const meetingId = ins.rows[0].id as string;
      if (cleanSummary) {
        await client.query(
          `INSERT INTO summaries (meeting_id, summary_text) VALUES ($1,$2)`,
          [meetingId, cleanSummary]
        );
      }
      await client.query('COMMIT');
      return { fileId, meetingId, outcome: 'created' };
    }

    // UPDATE condicional
    const row = existing.rows[0];
    const meetingId = row.id as string;
    const titleChanged = (row.title ?? '') !== title;
    const transcriptChanged = (row.transcription ?? '') !== transcript;
    const dateChanged = (row.meeting_date ?? null) !== meetingDate;
    const summaryChanged = ((row.summary_text ?? '') || '').trim() !== cleanSummary;

    if (!titleChanged && !transcriptChanged && !dateChanged && !summaryChanged) {
      await client.query('COMMIT');
      return { fileId, meetingId, outcome: 'skipped' };
    }

    // Atualiza só o que mudou; NÃO toca em status. metadata mesclado (topics/duration).
    await client.query(
      `UPDATE meetings SET
         title = $2,
         transcription = $3,
         transcription_length = $4,
         meeting_date = $5,
         metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
           'duration', $6, 'type', 'reuniao', 'topics', $7::jsonb)),
         updated_at = now()
       WHERE id = $1`,
      [meetingId, title, transcript, transcript.length, meetingDate,
       String(file.duration ?? ''), topicsJson]
    );

    if (summaryChanged && cleanSummary) {
      const hasSummary = await client.query(
        `SELECT id FROM summaries WHERE meeting_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [meetingId]
      );
      if (hasSummary.rowCount && hasSummary.rowCount > 0) {
        await client.query(`UPDATE summaries SET summary_text=$2 WHERE id=$1`,
          [hasSummary.rows[0].id, cleanSummary]);
      } else {
        await client.query(`INSERT INTO summaries (meeting_id, summary_text) VALUES ($1,$2)`,
          [meetingId, cleanSummary]);
      }
    }

    await client.query('COMMIT');
    return { fileId, meetingId, outcome: 'updated' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/tsx scripts/verify/ingest-one.mts`
Expected: PASS — `=== VERIFY ingest-one OK ===`. Os 226 meetings reais ficam intactos (o teste usa e limpa o `fileId` `ffff…`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `lib/plaud/ingest.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/plaud/ingest.ts scripts/verify/ingest-one.mts
git commit -m "feat(plaud): ingestPlaudFile — upsert condicional em meetings/summaries"
```

---

## Task 2: `POST /api/plaud/ingest` — lote manual

**Files:**
- Create: `app/api/plaud/ingest/route.ts`

**Contexto:** `listFiles(page, pageSize)` retorna `{ data: PlaudFile[]; page; page_size }`.
Página vazia (`data.length === 0`) = fim. `PlaudAuthError` sinaliza auth global.

- [ ] **Step 1: Implement the route**

Create `app/api/plaud/ingest/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError } from '@/lib/plaud/tokens';
import { ingestPlaudFile } from '@/lib/plaud/ingest';

const bodySchema = z.object({
  maxPages: z.number().int().positive().max(1000).optional(),
}).optional();

/**
 * Ingestão em lote manual: varre listFiles (paginado) e deposita cada gravação
 * em meetings/summaries via ingestPlaudFile (idempotente). NÃO roda IA.
 */
export async function POST(request: NextRequest) {
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
  }

  const summary = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] as { fileId: string; message: string }[] };
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
          summary.errors.push({ fileId: file.id, message: e instanceof Error ? e.message : String(e) });
        }
      }

      if (data.length < pageSize) break; // última página
      page += 1;
    }

    return Response.json({ data: summary });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      return Response.json({ error: error.message, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/ingest error:', error);
    return Response.json({ error: 'Internal server error', partial: summary }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint app/api/plaud/ingest/route.ts lib/plaud/ingest.ts`
Expected: exit 0.

- [ ] **Step 4: Smoke real da rota (opcional, requer Plaud autenticado)**

Só se os tokens do Plaud MCP estiverem válidos nesta máquina. Sobe o dev server e
dispara o lote com 1 página para não varrer tudo:

Run (terminal 1): `npm run dev`
Run (terminal 2): `curl -s -X POST localhost:3000/api/plaud/ingest -H 'content-type: application/json' -d '{"maxPages":1}' | node -e "process.stdin.on('data',d=>console.log(d.toString()))"`
Expected: JSON `{ "data": { "total": N, "created": .., "updated": .., "skipped": .., "errors": [] } }`.
Se retornar 401 `plaud_auth`, os tokens do Plaud expiraram — reautenticar o MCP; não é falha do código.

- [ ] **Step 5: Commit**

```bash
git add app/api/plaud/ingest/route.ts
git commit -m "feat(plaud): POST /api/plaud/ingest — ingestão em lote manual"
```

---

## Task 3: Limpeza dos scripts de verificação

**Files:**
- Delete: `scripts/verify/ingest-one.mts` (e o dir se vazio)

- [ ] **Step 1: Remove o script descartável**

```bash
rm scripts/verify/ingest-one.mts
rmdir scripts/verify 2>/dev/null || true
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 2: Typecheck final**

Run: `npx tsc --noEmit`
Expected: sem erros (sem referências pendentes ao script removido).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(plaud): remove script de verificação da Fase 3"
```

---

## Self-Review

**Spec coverage:**
- `ingestPlaudFile(fileId)` upsert condicional por conteúdo, preserva status → Task 1 ✓
- Escreve direto em meetings/summaries (não na view) → Task 1 (usa `pool.query`) ✓
- Idempotência por `metadata->>'plaud_file_id'` → Task 1 ✓
- Sem transcrição → skipped com reason → Task 1 (Step 1 caso 4 + impl) ✓
- `POST /api/plaud/ingest` lote, erro por-item não aborta, agregado, 401 auth → Task 2 ✓
- Sem flag `AI_SOURCE_INGEST`, sem cron, sem IA → nenhuma task adiciona isso ✓
- `local.db` intocado → nenhuma task o toca ✓
- Testes descritos no spec cobertos pelo script de verificação da Task 1 ✓

**Placeholder scan:** sem TBD/TODO; todo código completo; comandos com output esperado.

**Type consistency:** `IngestResult`/`IngestOutcome`/`IngestDeps` definidos na Task 1 e
usados igual na Task 2 e no script. `getFileContent` assinatura reusada via `typeof`.
`outcome` sempre um de `created|updated|skipped`. `meeting_date` tratado como DATE
('YYYY-MM-DD'), consistente com o schema cloud verificado.
