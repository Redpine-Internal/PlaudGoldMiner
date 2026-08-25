# Enriquecimento de Ideias + Assuntos de Interesse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir enriquecer qualquer card de ideia (Oportunidade/Insight/Conteúdo, em qualquer tela incluindo o Dashboard) via um modal global — texto editável, observações, flag "interessante", fontes/referências e upload de imagens — e agregar os marcados numa página "Assuntos de Interesse", tudo antes de criar o projeto.

**Architecture:** Tabelas novas `app_idea_enrichment` + `app_idea_enrichment_reference` no banco SISTEMA (`MEETINGS_DATABASE_URL`), acessadas por `pool.query` cru (padrão do projeto). Um `EnrichmentProvider` global (montado no `layout.tsx`) mantém um único `GET /api/enrichment/interesting` e um único `IdeaEnrichmentModal` compartilhado; os 3 componentes de card consomem o contexto para abrir o modal e exibir o selo de estrela. Imagens vão para um bucket novo no Supabase Storage do projeto SISTEMA.

**Tech Stack:** Next.js 16 App Router, TypeScript, `pg` Pool (raw SQL), SWR, `@supabase/supabase-js` (novo, só para Storage), CSS tokens do design system.

**Verification model (LEIA):** O projeto **não tem test runner** (sem jest/vitest). Verificação = (a) `npx tsc --noEmit` deve sair com código 0; (b) scripts `tsx` em `scripts/verify/` que batem no DB/API real; (c) smoke via `curl` contra o dev server em `http://127.0.0.1:3000`. Onde o plano diz "test", significa esses mecanismos — não um runner de unidade.

**Restrições travadas (OFF-LIMITS):** NÃO tocar Clone/embeddings/Plaud/n8n. Usar SEMPRE `SUPABASE_*_SISTEMA`; NUNCA `SUPABASE_*_EMBEDINGS`. Segredos mascarados em output. Sem `DROP`/alteração de tabela existente. Vínculo lógico via `(source_type, source_id)`, sem FK para tabelas de origem.

---

## File Structure

**Criar:**
- `scripts/migrations/2026-08-25-enrichment.sql` — DDL idempotente das 2 tabelas.
- `scripts/verify/enrichment-schema.ts` — verifica que as tabelas existem no SISTEMA.
- `scripts/verify/enrichment-storage.ts` — verifica que o bucket existe e é acessível.
- `lib/supabaseStorage.ts` — client Supabase Storage isolado (service-role SISTEMA, só servidor).
- `app/api/enrichment/route.ts` — GET (ler enrichment+refs) / PUT (upsert campos).
- `app/api/enrichment/reference/route.ts` — POST (add ref) / DELETE (remove ref + objeto).
- `app/api/enrichment/upload/route.ts` — POST (presigned upload URL).
- `app/api/enrichment/interesting/route.ts` — GET (agrega marcados + dados da ideia).
- `components/ds/enrichment/EnrichmentProvider.tsx` — contexto global + modal montado.
- `components/ds/enrichment/IdeaEnrichmentModal.tsx` — o modal em si.
- `components/ds/enrichment/useEnrichment.ts` — hook de acesso ao contexto.
- `app/assuntos-interesse/page.tsx` — página agregadora.

**Modificar:**
- `lib/db/schema.ts` — adicionar `pgTable` das 2 tabelas (documentação/tipos; DDL real via script).
- `components/ds/index.ts` — exportar provider/modal/hook.
- `components/layout/AppShell.tsx` (ou `app/layout.tsx`) — montar `EnrichmentProvider`.
- `components/ds/OpportunityCard.tsx`, `InsightCard.tsx`, `ContentCard.tsx` — selo + abrir modal.
- `components/layout/Sidebar.tsx` — item de menu "Assuntos de Interesse".
- `app/oportunidades/page.tsx`, `app/insights/page.tsx`, `app/conteudos/page.tsx` — filtro "Só interessantes".
- `package.json` — dependência `@supabase/supabase-js`.

---

## Task 1: Migração SQL das tabelas de enriquecimento

**Files:**
- Create: `scripts/migrations/2026-08-25-enrichment.sql`
- Create: `scripts/verify/enrichment-schema.ts`

- [ ] **Step 1: Escrever o DDL idempotente**

Create `scripts/migrations/2026-08-25-enrichment.sql`:

```sql
-- Enriquecimento de ideias. Banco SISTEMA. Idempotente. Sem DROP.
CREATE TABLE IF NOT EXISTS app_idea_enrichment (
  id            uuid PRIMARY KEY,
  source_type   text NOT NULL,
  source_id     text NOT NULL,
  interesting   boolean NOT NULL DEFAULT false,
  notes         text,
  text_override text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_idea_enrichment_source_uidx
  ON app_idea_enrichment (source_type, source_id);

CREATE INDEX IF NOT EXISTS app_idea_enrichment_interesting_idx
  ON app_idea_enrichment (interesting);

CREATE TABLE IF NOT EXISTS app_idea_enrichment_reference (
  id            uuid PRIMARY KEY,
  enrichment_id uuid NOT NULL REFERENCES app_idea_enrichment(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  title         text,
  url           text NOT NULL,
  storage_path  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_idea_enrichment_reference_eid_idx
  ON app_idea_enrichment_reference (enrichment_id);
```

- [ ] **Step 2: Aplicar a migração no SISTEMA**

Run (usa o mesmo `MEETINGS_DATABASE_URL` do runtime, que aponta para o SISTEMA):

```bash
psql "$MEETINGS_DATABASE_URL" -f scripts/migrations/2026-08-25-enrichment.sql
```

Se `psql` não estiver disponível, aplicar via `tsx` com o Pool:

```bash
npx tsx -e "import{Pool}from'pg';import{readFileSync}from'fs';const p=new Pool({connectionString:process.env.MEETINGS_DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query(readFileSync('scripts/migrations/2026-08-25-enrichment.sql','utf8')).then(()=>{console.log('OK');return p.end();}).catch(e=>{console.error(e);process.exit(1);});"
```

Expected: imprime `OK` (ou `CREATE TABLE`/`CREATE INDEX` no psql), sem erro.

- [ ] **Step 3: Escrever o verify script**

Create `scripts/verify/enrichment-schema.ts`:

```ts
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.MEETINGS_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('app_idea_enrichment','app_idea_enrichment_reference')
     ORDER BY table_name`
  );
  const found = rows.map((r) => r.table_name);
  const expected = ["app_idea_enrichment", "app_idea_enrichment_reference"];
  const missing = expected.filter((t) => !found.includes(t));
  if (missing.length) {
    console.error("MISSING tables:", missing);
    process.exit(1);
  }
  console.log("OK: enrichment tables present:", found.join(", "));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Rodar o verify script**

Run:

```bash
npx tsx scripts/verify/enrichment-schema.ts
```

Expected: `OK: enrichment tables present: app_idea_enrichment, app_idea_enrichment_reference`

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/2026-08-25-enrichment.sql scripts/verify/enrichment-schema.ts
git commit -m "feat(enrichment): migracao das tabelas de enriquecimento no SISTEMA"
```

---

## Task 2: Declarar as tabelas no schema.ts (tipos/documentação)

**Files:**
- Modify: `lib/db/schema.ts` (após o bloco de PROJECT TASKS, antes de `// ===== TYPE EXPORTS =====`)

- [ ] **Step 1: Adicionar os `pgTable`**

Localizar em `lib/db/schema.ts` a linha `// ===== TYPE EXPORTS =====` e inserir ANTES dela:

```ts
// ===== IDEA ENRICHMENT (app_idea_enrichment) =====
// Enriquecimento de uma ideia antes de virar projeto. Vínculo lógico via
// (source_type, source_id) — sem FK para as tabelas de origem (OFF-LIMITS).
export const ideaEnrichment = pgTable('app_idea_enrichment', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(),        // 'opportunity' / 'insight' / 'content'
  sourceId: text('source_id').notNull(),
  interesting: boolean('interesting').notNull().default(false),
  notes: text('notes'),
  textOverride: text('text_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('app_idea_enrichment_source_uidx').on(table.sourceType, table.sourceId),
  index('app_idea_enrichment_interesting_idx').on(table.interesting),
]);

// ===== IDEA ENRICHMENT REFERENCES (app_idea_enrichment_reference) =====
export const ideaEnrichmentReference = pgTable('app_idea_enrichment_reference', {
  id: text('id').primaryKey(),
  enrichmentId: text('enrichment_id').notNull(),
  kind: text('kind').notNull(),                     // 'link' / 'image'
  title: text('title'),
  url: text('url').notNull(),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_idea_enrichment_reference_eid_idx').on(table.enrichmentId),
]);
```

- [ ] **Step 2: Garantir os imports necessários**

No topo de `lib/db/schema.ts`, o import de `drizzle-orm/pg-core` já traz `pgTable`, `text`, `timestamp`, `index`, `real`. Confirmar que `boolean` e `uniqueIndex` estão na lista; se faltarem, adicioná-los. Verificar com:

```bash
grep -nE "boolean|uniqueIndex" lib/db/schema.ts | head
```

Se não aparecerem no bloco de import do `pg-core`, editar o import para incluí-los (ex.: `import { pgTable, text, timestamp, index, real, boolean, uniqueIndex } from 'drizzle-orm/pg-core';`).

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0 (sem erros).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(enrichment): declara tabelas de enriquecimento no schema drizzle"
```

---

## Task 3: Rota GET/PUT `/api/enrichment`

**Files:**
- Create: `app/api/enrichment/route.ts`

- [ ] **Step 1: Implementar a rota**

Create `app/api/enrichment/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function isSourceType(v: unknown): v is SourceType {
  return typeof v === 'string' && (SOURCE_TYPES as readonly string[]).includes(v);
}

const FIELDS = `id, source_type AS "sourceType", source_id AS "sourceId",
  interesting, notes, text_override AS "textOverride",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

interface EnrichmentRow {
  id: string;
  sourceType: string;
  sourceId: string;
  interesting: boolean;
  notes: string | null;
  textOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReferenceRow {
  id: string;
  kind: string;
  title: string | null;
  url: string;
  storagePath: string | null;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const sourceType = sp.get('sourceType');
    const sourceId = sp.get('sourceId');
    if (!isSourceType(sourceType) || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    const enrich = await pool.query<EnrichmentRow>(
      `SELECT ${FIELDS} FROM app_idea_enrichment WHERE source_type = $1 AND source_id = $2`,
      [sourceType, sourceId]
    );
    if (!enrich.rows.length) {
      return NextResponse.json({ data: null });
    }
    const row = enrich.rows[0];
    const refs = await pool.query<ReferenceRow>(
      `SELECT id, kind, title, url, storage_path AS "storagePath", created_at AS "createdAt"
       FROM app_idea_enrichment_reference WHERE enrichment_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );
    return NextResponse.json({ data: { ...row, references: refs.rows } });
  } catch (error) {
    console.error('Error reading enrichment:', error);
    return NextResponse.json({ error: 'Failed to read enrichment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, interesting, notes, textOverride } = body ?? {};
    if (!isSourceType(sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    const result = await pool.query<EnrichmentRow>(
      `INSERT INTO app_idea_enrichment (id, source_type, source_id, interesting, notes, text_override)
       VALUES ($1, $2, $3, COALESCE($4, false), $5, $6)
       ON CONFLICT (source_type, source_id) DO UPDATE SET
         interesting = COALESCE($4, app_idea_enrichment.interesting),
         notes = COALESCE($5, app_idea_enrichment.notes),
         text_override = COALESCE($6, app_idea_enrichment.text_override),
         updated_at = now()
       RETURNING ${FIELDS}`,
      [
        crypto.randomUUID(),
        sourceType,
        sourceId,
        typeof interesting === 'boolean' ? interesting : null,
        typeof notes === 'string' ? notes : null,
        typeof textOverride === 'string' ? textOverride : null,
      ]
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error upserting enrichment:', error);
    return NextResponse.json({ error: 'Failed to save enrichment' }, { status: 500 });
  }
}
```

> Nota de design: `COALESCE($n, coluna)` faz PUT parcial — passar só `{interesting}` não apaga `notes`. Para LIMPAR um campo texto o cliente envia string vazia `""` (que é `typeof === 'string'`, então grava `''`, não null).

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Smoke test (dev server rodando)**

Garantir dev server: `npm run dev` (se não estiver de pé). Depois:

```bash
curl -s -X PUT http://127.0.0.1:3000/api/enrichment \
  -H 'Content-Type: application/json' \
  -d '{"sourceType":"opportunity","sourceId":"__smoke__","interesting":true,"notes":"nota de teste"}'
echo
curl -s "http://127.0.0.1:3000/api/enrichment?sourceType=opportunity&sourceId=__smoke__"
```

Expected: o PUT retorna `{"data":{...,"interesting":true,"notes":"nota de teste",...}}`; o GET retorna o mesmo com `"references":[]`.

- [ ] **Step 4: Limpar a linha de smoke**

```bash
npx tsx -e "import{Pool}from'pg';const p=new Pool({connectionString:process.env.MEETINGS_DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query(\"DELETE FROM app_idea_enrichment WHERE source_id='__smoke__'\").then(()=>{console.log('cleaned');return p.end();});"
```

Expected: `cleaned`.

- [ ] **Step 5: Commit**

```bash
git add app/api/enrichment/route.ts
git commit -m "feat(enrichment): rota GET/PUT /api/enrichment (upsert por source)"
```

---

## Task 4: Rota POST/DELETE `/api/enrichment/reference`

**Files:**
- Create: `app/api/enrichment/reference/route.ts`

- [ ] **Step 1: Implementar a rota**

Create `app/api/enrichment/reference/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
const KINDS = ['link', 'image'] as const;

function inList<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

interface RefRow {
  id: string;
  kind: string;
  title: string | null;
  url: string;
  storagePath: string | null;
  createdAt: string;
}

/** Garante um enrichment para (sourceType, sourceId) e devolve seu id. */
async function ensureEnrichmentId(sourceType: string, sourceId: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO app_idea_enrichment (id, source_type, source_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [crypto.randomUUID(), sourceType, sourceId]
  );
  return res.rows[0].id;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, kind, title, url, storagePath } = body ?? {};
    if (!inList(SOURCE_TYPES, sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    if (!inList(KINDS, kind)) {
      return NextResponse.json({ error: "kind deve ser 'link' ou 'image'" }, { status: 400 });
    }
    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'url é obrigatória' }, { status: 400 });
    }
    const enrichmentId = await ensureEnrichmentId(sourceType, sourceId);
    const result = await pool.query<RefRow>(
      `INSERT INTO app_idea_enrichment_reference (id, enrichment_id, kind, title, url, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, title, url, storage_path AS "storagePath", created_at AS "createdAt"`,
      [
        crypto.randomUUID(),
        enrichmentId,
        kind,
        typeof title === 'string' ? title : null,
        url.trim(),
        typeof storagePath === 'string' ? storagePath : null,
      ]
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error adding reference:', error);
    return NextResponse.json({ error: 'Failed to add reference' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    }
    const found = await pool.query<{ kind: string; storagePath: string | null }>(
      `DELETE FROM app_idea_enrichment_reference WHERE id = $1
       RETURNING kind, storage_path AS "storagePath"`,
      [id]
    );
    if (!found.rows.length) {
      return NextResponse.json({ error: 'referência não encontrada' }, { status: 404 });
    }
    const ref = found.rows[0];
    // Best-effort: remover o objeto do Storage se for imagem.
    if (ref.kind === 'image' && ref.storagePath) {
      try {
        const { removeObject } = await import('@/lib/supabaseStorage');
        await removeObject(ref.storagePath);
      } catch (e) {
        console.error('Falha ao remover objeto do storage (ignorado):', e);
      }
    }
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('Error deleting reference:', error);
    return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 });
  }
}
```

> `@/lib/supabaseStorage` (Task 6) exporta `removeObject`. O import é dinâmico para a rota não quebrar caso o storage não esteja configurado — a remoção é best-effort.

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0. (Se acusar `Cannot find module '@/lib/supabaseStorage'` no import dinâmico: isso é resolvido na Task 6; por ora, se o tsc reclamar de módulo faltante, criar um stub mínimo primeiro — mas normalmente `import()` dinâmico não falha o tsc por módulo ausente. Se falhar, pular a verificação até a Task 6 e anotar como DONE_WITH_CONCERNS.)

- [ ] **Step 3: Smoke test**

```bash
curl -s -X POST http://127.0.0.1:3000/api/enrichment/reference \
  -H 'Content-Type: application/json' \
  -d '{"sourceType":"opportunity","sourceId":"__smoke__","kind":"link","title":"Fonte X","url":"https://exemplo.com"}'
```

Expected: `{"data":{"id":"...","kind":"link","title":"Fonte X","url":"https://exemplo.com",...}}`. Guardar o `id` retornado e apagá-lo:

```bash
# substitua <ID> pelo id retornado acima
curl -s -X DELETE "http://127.0.0.1:3000/api/enrichment/reference?id=<ID>"
```

Expected: `{"data":{"id":"<ID>"}}`. Depois limpar o enrichment de smoke:

```bash
npx tsx -e "import{Pool}from'pg';const p=new Pool({connectionString:process.env.MEETINGS_DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query(\"DELETE FROM app_idea_enrichment WHERE source_id='__smoke__'\").then(()=>{console.log('cleaned');return p.end();});"
```

Expected: `cleaned`.

- [ ] **Step 4: Commit**

```bash
git add app/api/enrichment/reference/route.ts
git commit -m "feat(enrichment): rota POST/DELETE /api/enrichment/reference"
```

---

## Task 5: Instalar supabase-js e criar o bucket no SISTEMA

**Files:**
- Modify: `package.json` (via npm install)
- Create: `scripts/verify/enrichment-storage.ts`

- [ ] **Step 1: Instalar a dependência**

Run:

```bash
npm install @supabase/supabase-js
```

Expected: adiciona `@supabase/supabase-js` a `dependencies` em `package.json`.

- [ ] **Step 2: Criar o bucket `idea-enrichment` no projeto SISTEMA**

Run (usa a service-role key do SISTEMA — NUNCA a de embeddings):

```bash
npx tsx -e "import{createClient}from'@supabase/supabase-js';const s=createClient(process.env.SUPABASE_URL_SISTEMA,process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA);s.storage.createBucket('idea-enrichment',{public:true,fileSizeLimit:'5MB',allowedMimeTypes:['image/png','image/jpeg','image/webp','image/gif']}).then(({data,error})=>{if(error&&!String(error.message).toLowerCase().includes('already exists')){console.error(error);process.exit(1);}console.log('bucket ok');});"
```

Expected: imprime `bucket ok` (idempotente — trata "already exists" como sucesso).

- [ ] **Step 3: Escrever o verify de storage**

Create `scripts/verify/enrichment-storage.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL_SISTEMA;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA;

async function main() {
  if (!url || !key) {
    console.error('MISSING SUPABASE_URL_SISTEMA / SUPABASE_SERVICE_ROLE_KEY_SISTEMA');
    process.exit(1);
  }
  const s = createClient(url, key);
  const { data, error } = await s.storage.getBucket('idea-enrichment');
  if (error || !data) {
    console.error('bucket idea-enrichment NÃO encontrado:', error?.message);
    process.exit(1);
  }
  console.log('OK: bucket idea-enrichment presente, public =', data.public);
}

main();
```

- [ ] **Step 4: Rodar o verify**

Run:

```bash
npx tsx scripts/verify/enrichment-storage.ts
```

Expected: `OK: bucket idea-enrichment presente, public = true`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/verify/enrichment-storage.ts
git commit -m "feat(enrichment): supabase-js + bucket idea-enrichment no SISTEMA"
```

---

## Task 6: Helper `lib/supabaseStorage.ts`

**Files:**
- Create: `lib/supabaseStorage.ts`

- [ ] **Step 1: Implementar o helper**

Create `lib/supabaseStorage.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client de Storage ISOLADO do projeto SISTEMA. NUNCA usar as chaves *_EMBEDINGS.
// Só deve ser importado em código de servidor (rotas de API).
const BUCKET = 'idea-enrichment';

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL_SISTEMA;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA;
  if (!url || !key) {
    throw new Error('SUPABASE_URL_SISTEMA / SUPABASE_SERVICE_ROLE_KEY_SISTEMA ausentes');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}

/** Cria uma URL assinada de upload para um caminho e devolve também a URL pública. */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const s = client();
  const { data, error } = await s.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Falha ao criar signed upload URL: ${error?.message}`);
  }
  const { data: pub } = s.storage.from(BUCKET).getPublicUrl(path);
  return { path: data.path, signedUrl: data.signedUrl, token: data.token, publicUrl: pub.publicUrl };
}

/** Remove um objeto do bucket (best-effort). */
export async function removeObject(path: string): Promise<void> {
  const s = client();
  const { error } = await s.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Falha ao remover objeto: ${error.message}`);
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/supabaseStorage.ts
git commit -m "feat(enrichment): helper isolado de Supabase Storage (SISTEMA)"
```

---

## Task 7: Rota POST `/api/enrichment/upload` (presigned)

**Files:**
- Create: `app/api/enrichment/upload/route.ts`

- [ ] **Step 1: Implementar a rota**

Create `app/api/enrichment/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSignedUpload } from '@/lib/supabaseStorage';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function inList<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** Remove caracteres perigosos do nome de arquivo. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, filename, contentType } = body ?? {};
    if (!inList(SOURCE_TYPES, sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    if (typeof filename !== 'string' || !filename) {
      return NextResponse.json({ error: 'filename é obrigatório' }, { status: 400 });
    }
    if (!inList(ALLOWED, contentType)) {
      return NextResponse.json({ error: 'contentType não permitido' }, { status: 400 });
    }
    const path = `enrichment/${sourceType}/${sourceId}/${crypto.randomUUID()}-${safeName(filename)}`;
    const upload = await createSignedUpload(path);
    return NextResponse.json({ data: upload });
  } catch (error) {
    console.error('Error creating upload URL:', error);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
```

> O limite de 5 MB é imposto pelo bucket (`fileSizeLimit` na criação). A validação de contentType aqui é a primeira barreira; o cliente também deve checar `file.size` antes de pedir a URL.

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Smoke test**

```bash
curl -s -X POST http://127.0.0.1:3000/api/enrichment/upload \
  -H 'Content-Type: application/json' \
  -d '{"sourceType":"opportunity","sourceId":"__smoke__","filename":"foto.png","contentType":"image/png"}'
```

Expected: `{"data":{"path":"enrichment/opportunity/__smoke__/...-foto.png","signedUrl":"https://...","token":"...","publicUrl":"https://..."}}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/enrichment/upload/route.ts
git commit -m "feat(enrichment): rota POST /api/enrichment/upload (signed upload)"
```

---

## Task 8: Rota GET `/api/enrichment/interesting` (agregada)

**Files:**
- Create: `app/api/enrichment/interesting/route.ts`

- [ ] **Step 1: Confirmar nomes de tabela/coluna das fontes**

Colunas JÁ VERIFICADAS em `lib/db/schema.ts`: `app_opportunities` → `id`, `title`, `pain`; `app_cross_insights` → `id`, `title`, `description`; `app_contents` → `id`, `title`, `theme`. O SELECT do Step 2 usa exatamente essas. Reconfirmar se desejar:

```bash
grep -nE "app_opportunities|app_cross_insights|app_contents" lib/db/schema.ts
```

- [ ] **Step 2: Implementar a rota**

Create `app/api/enrichment/interesting/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface InterestingRow {
  enrichmentId: string;
  sourceType: string;
  sourceId: string;
  notes: string | null;
  textOverride: string | null;
  updatedAt: string;
  refCount: number;
  title: string | null;
  subtitle: string | null;
}

/**
 * Agrega ideias marcadas como interessantes, já juntando o título/subtítulo da
 * ideia de origem (SELECT de leitura — permitido). LEFT JOIN por tipo: cada
 * enrichment casa com no máximo uma das três tabelas, pelo source_id.
 */
export async function GET() {
  try {
    const { rows } = await pool.query<InterestingRow>(
      `SELECT
         e.id            AS "enrichmentId",
         e.source_type   AS "sourceType",
         e.source_id     AS "sourceId",
         e.notes         AS "notes",
         e.text_override AS "textOverride",
         e.updated_at    AS "updatedAt",
         COALESCE(rc.n, 0)::int AS "refCount",
         COALESCE(o.title, i.title, c.title) AS "title",
         COALESCE(o.pain, i.description, c.theme) AS "subtitle"
       FROM app_idea_enrichment e
       LEFT JOIN app_opportunities o ON e.source_type = 'opportunity' AND o.id = e.source_id
       LEFT JOIN app_cross_insights i ON e.source_type = 'insight' AND i.id = e.source_id
       LEFT JOIN app_contents c ON e.source_type = 'content' AND c.id = e.source_id
       LEFT JOIN (
         SELECT enrichment_id, COUNT(*) AS n
         FROM app_idea_enrichment_reference GROUP BY enrichment_id
       ) rc ON rc.enrichment_id = e.id
       WHERE e.interesting = true
       ORDER BY e.updated_at DESC`
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Error listing interesting:', error);
    return NextResponse.json({ error: 'Failed to list interesting' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Smoke test**

Criar um marcado, listar, limpar:

```bash
curl -s -X PUT http://127.0.0.1:3000/api/enrichment -H 'Content-Type: application/json' \
  -d '{"sourceType":"opportunity","sourceId":"__smoke__","interesting":true}' >/dev/null
curl -s http://127.0.0.1:3000/api/enrichment/interesting
```

Expected: um array contendo o item com `"sourceId":"__smoke__"`, `"interesting"` implícito (só vêm os true), `"refCount":0`, `title`/`subtitle` possivelmente null (id fake). Limpar:

```bash
npx tsx -e "import{Pool}from'pg';const p=new Pool({connectionString:process.env.MEETINGS_DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query(\"DELETE FROM app_idea_enrichment WHERE source_id='__smoke__'\").then(()=>{console.log('cleaned');return p.end();});"
```

Expected: `cleaned`.

- [ ] **Step 5: Commit**

```bash
git add app/api/enrichment/interesting/route.ts
git commit -m "feat(enrichment): rota GET /api/enrichment/interesting (agregada)"
```

---

## Task 9: Hook e contexto `useEnrichment` + `EnrichmentProvider`

**Files:**
- Create: `components/ds/enrichment/useEnrichment.ts`
- Create: `components/ds/enrichment/EnrichmentProvider.tsx`

- [ ] **Step 1: Definir tipos e contexto**

Create `components/ds/enrichment/useEnrichment.ts`:

```ts
"use client";
import { createContext, useContext } from "react";

export type EnrichmentSourceType = "opportunity" | "insight" | "content";

/** Dados mínimos da ideia para exibir no modal quando ainda não há override. */
export interface IdeaData {
  title: string;
  originalText: string;
}

export interface EnrichmentContextValue {
  /** True se (sourceType, sourceId) está marcado como interessante. */
  isInteresting: (sourceType: EnrichmentSourceType, sourceId: string) => boolean;
  /** Abre o modal global de enriquecimento para uma ideia. */
  openEnrichment: (sourceType: EnrichmentSourceType, sourceId: string, idea: IdeaData) => void;
  /** Revalida o conjunto de interessantes (após salvar). */
  refresh: () => void;
}

export const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

/** Acesso ao contexto. Retorna null se não houver provider (fallback seguro). */
export function useEnrichment(): EnrichmentContextValue | null {
  return useContext(EnrichmentContext);
}
```

- [ ] **Step 2: Implementar o provider (sem o modal ainda — placeholder)**

Create `components/ds/enrichment/EnrichmentProvider.tsx`:

```tsx
"use client";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  EnrichmentContext,
  type EnrichmentSourceType,
  type IdeaData,
} from "./useEnrichment";
import { IdeaEnrichmentModal } from "./IdeaEnrichmentModal";

interface InterestingItem {
  sourceType: string;
  sourceId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface OpenState {
  sourceType: EnrichmentSourceType;
  sourceId: string;
  idea: IdeaData;
}

export function EnrichmentProvider({ children }: { children: React.ReactNode }) {
  const { data, mutate } = useSWR<{ data: InterestingItem[] }>(
    "/api/enrichment/interesting",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [open, setOpen] = useState<OpenState | null>(null);

  const interestingSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of data?.data || []) s.add(`${it.sourceType}:${it.sourceId}`);
    return s;
  }, [data]);

  const isInteresting = useCallback(
    (sourceType: EnrichmentSourceType, sourceId: string) =>
      interestingSet.has(`${sourceType}:${sourceId}`),
    [interestingSet]
  );

  const openEnrichment = useCallback(
    (sourceType: EnrichmentSourceType, sourceId: string, idea: IdeaData) =>
      setOpen({ sourceType, sourceId, idea }),
    []
  );

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const value = useMemo(
    () => ({ isInteresting, openEnrichment, refresh }),
    [isInteresting, openEnrichment, refresh]
  );

  return (
    <EnrichmentContext.Provider value={value}>
      {children}
      {open ? (
        <IdeaEnrichmentModal
          sourceType={open.sourceType}
          sourceId={open.sourceId}
          idea={open.idea}
          onClose={() => setOpen(null)}
          onSaved={refresh}
        />
      ) : null}
    </EnrichmentContext.Provider>
  );
}
```

> A referência a `IdeaEnrichmentModal` será satisfeita na Task 10. Não rodar typecheck isolado nesta task — o modal é criado a seguir. Marcar esta task como concluída junto da Task 10 (elas formam um par). Alternativamente, criar primeiro um stub do modal (Task 10 Step 1) e só então o provider.

- [ ] **Step 3: Commit (junto com Task 10)**

Adiar o commit para o fim da Task 10, quando o par provider+modal compila.

---

## Task 10: `IdeaEnrichmentModal`

**Files:**
- Create: `components/ds/enrichment/IdeaEnrichmentModal.tsx`

- [ ] **Step 1: Implementar o modal**

Create `components/ds/enrichment/IdeaEnrichmentModal.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../Button";
import { Icon } from "../Icon";
import type { EnrichmentSourceType, IdeaData } from "./useEnrichment";

interface ReferenceItem {
  id: string;
  kind: "link" | "image";
  title: string | null;
  url: string;
  storagePath: string | null;
}

interface EnrichmentData {
  id: string;
  interesting: boolean;
  notes: string | null;
  textOverride: string | null;
  references: ReferenceItem[];
}

interface Props {
  sourceType: EnrichmentSourceType;
  sourceId: string;
  idea: IdeaData;
  onClose: () => void;
  onSaved: () => void;
}

const ALLOWED_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export function IdeaEnrichmentModal({ sourceType, sourceId, idea, onClose, onSaved }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interesting, setInteresting] = useState(false);
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [textEdited, setTextEdited] = useState(false);
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega o enriquecimento existente ao abrir.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/enrichment?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`
        );
        const body = (await res.json()) as { data: EnrichmentData | null };
        if (!alive) return;
        if (body.data) {
          setInteresting(body.data.interesting);
          setNotes(body.data.notes ?? "");
          setText(body.data.textOverride ?? idea.originalText);
          setTextEdited(body.data.textOverride != null);
          setRefs(body.data.references || []);
        } else {
          setText(idea.originalText);
        }
      } catch {
        if (alive) setError("Não foi possível carregar o enriquecimento.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceType, sourceId, idea.originalText]);

  // PUT parcial dos campos de texto/flag.
  const put = async (patch: Record<string, unknown>) => {
    try {
      await fetch("/api/enrichment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId, ...patch }),
      });
      onSaved();
    } catch {
      setError("Falha ao salvar. Verifique a conexão.");
    }
  };

  // Autosave com debounce para notes e text.
  const scheduleSave = (patch: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => put(patch), 600);
  };

  const toggleInteresting = () => {
    const next = !interesting;
    setInteresting(next);
    put({ interesting: next });
  };

  const addLink = async () => {
    if (!linkUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/enrichment/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          kind: "link",
          title: linkTitle.trim() || null,
          url: linkUrl.trim(),
        }),
      });
      const body = (await res.json()) as { data?: ReferenceItem; error?: string };
      if (body.data) {
        setRefs((r) => [...r, body.data as ReferenceItem]);
        setLinkTitle("");
        setLinkUrl("");
      } else {
        setError(body.error || "Falha ao adicionar link.");
      }
    } finally {
      setBusy(false);
    }
  };

  const addImage = async (file: File) => {
    if (!ALLOWED_IMG.includes(file.type)) {
      setError("Tipo de imagem não suportado.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Imagem maior que 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const up = await fetch("/api/enrichment/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId, filename: file.name, contentType: file.type }),
      });
      const upBody = (await up.json()) as {
        data?: { signedUrl: string; path: string; publicUrl: string };
        error?: string;
      };
      if (!upBody.data) {
        setError(upBody.error || "Falha ao preparar upload.");
        return;
      }
      // Upload direto ao Storage via signedUrl.
      const putRes = await fetch(upBody.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Falha no upload da imagem.");
        return;
      }
      const refRes = await fetch("/api/enrichment/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          kind: "image",
          title: file.name,
          url: upBody.data.publicUrl,
          storagePath: upBody.data.path,
        }),
      });
      const refBody = (await refRes.json()) as { data?: ReferenceItem };
      if (refBody.data) setRefs((r) => [...r, refBody.data as ReferenceItem]);
    } finally {
      setBusy(false);
    }
  };

  const removeRef = async (id: string) => {
    await fetch(`/api/enrichment/reference?id=${id}`, { method: "DELETE" });
    setRefs((r) => r.filter((x) => x.id !== id));
  };

  // Monta a descrição enriquecida e cria o projeto.
  const createProject = async () => {
    setBusy(true);
    try {
      const parts = [text.trim()];
      if (notes.trim()) parts.push(`\n\nObservações:\n${notes.trim()}`);
      const links = refs.filter((r) => r.kind === "link");
      if (links.length) {
        parts.push(
          "\n\nFontes/Referências:\n" +
            links.map((l) => `- ${l.title ? l.title + ": " : ""}${l.url}`).join("\n")
        );
      }
      const description = parts.join("");
      const existing = await fetch(
        `/api/projects?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}&limit=1`
      );
      if (existing.ok) {
        const ex = await existing.json();
        const found = ex?.data?.[0];
        if (found?.id) {
          router.push(`/projetos/${found.id}`);
          return;
        }
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: idea.title, description, sourceType, sourceId }),
      });
      const body = await res.json();
      const id = body?.data?.id;
      if (id) router.push(`/projetos/${id}`);
      else setError(body?.error || "Falha ao criar projeto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--backgroundContainer)",
          borderRadius: 12,
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ font: "400 20px/28px var(--fontFamily)", margin: 0 }}>{idea.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant={interesting ? "primary" : "outline"}
              size="sm"
              icon="star"
              onClick={toggleInteresting}
              title={interesting ? "Remover de interessantes" : "Marcar como interessante"}
            >
              {interesting ? "Interessante" : "Marcar"}
            </Button>
            <button type="button" onClick={onClose} title="Fechar" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" style={{ padding: "8px 12px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 8, font: "400 13px/18px var(--font-sans)" }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--color-muted-foreground)" }}>Carregando…</p>
        ) : (
          <>
            <label className="ds-label">Texto gerado {textEdited ? "(editado)" : ""}</label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTextEdited(true);
                scheduleSave({ textOverride: e.target.value });
              }}
              rows={6}
              style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: 8, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
            />

            <label className="ds-label">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                scheduleSave({ notes: e.target.value });
              }}
              rows={4}
              placeholder="Suas anotações sobre esta ideia…"
              style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: 8, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
            />

            <label className="ds-label">Fontes / Referências</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refs.filter((r) => r.kind === "link").map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="documents" size={16} />
                  <a href={r.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: "var(--textLink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title || r.url}
                  </a>
                  <button type="button" onClick={() => removeRef(r.id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Título (opcional)" style={{ width: 180, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <Button size="sm" variant="outline" icon="add-more" onClick={addLink} disabled={busy || !linkUrl.trim()}>Adicionar</Button>
              </div>
            </div>

            <label className="ds-label">Imagens</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {refs.filter((r) => r.kind === "image").map((r) => (
                <div key={r.id} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={r.title || "imagem"} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
                  <button type="button" onClick={() => removeRef(r.id)} title="Remover" style={{ position: "absolute", top: 2, right: 2, background: "var(--backgroundContainer)", border: "1px solid var(--color-border)", borderRadius: 999, cursor: "pointer", padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <label style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--color-border)", borderRadius: 8, cursor: "pointer" }}>
                <Icon name="add-more" size={20} color="var(--color-muted-foreground)" />
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button variant="primary" icon="layout-dashboard" iconSpin={busy} onClick={createProject} disabled={busy}>Criar Projeto</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck do par provider+modal**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0. **Nota de ícones (JÁ VERIFICADO):** o `Icon` usa stems Mística de `public/icons/<stem>-regular.svg`, com um MAP de nomes legados em `components/ds/Icon.tsx` (`x`→`close`, `plus`→`add-more`, `layout-dashboard`→`apps`, `sparkles`→`ai`). Stems que EXISTEM e são usados aqui: `star`, `add-more`, `check`, `close` (via `x`), `apps` (via `layout-dashboard`), `documents`. **NÃO existe** ícone `link` — por isso as referências usam `documents`. Se o tsc reclamar de `Icon name` (a prop é `string`, então normalmente não reclama), o risco real é ícone vazio em runtime: confirmar o stem em disco com:

```bash
ls public/icons/ | sed 's/-regular.svg//' | sort | tr '\n' ' '
```

E, se faltar, trocar pelo stem equivalente disponível na lista acima.

- [ ] **Step 3: Commit (par provider + modal)**

```bash
git add components/ds/enrichment/useEnrichment.ts components/ds/enrichment/EnrichmentProvider.tsx components/ds/enrichment/IdeaEnrichmentModal.tsx
git commit -m "feat(enrichment): provider global + modal de enriquecimento de ideias"
```

---

## Task 11: Exportar no barrel e montar o provider no layout

**Files:**
- Modify: `components/ds/index.ts`
- Modify: `components/layout/AppShell.tsx`

- [ ] **Step 1: Exportar no barrel**

Ao final de `components/ds/index.ts`, adicionar:

```ts
export { EnrichmentProvider } from "./enrichment/EnrichmentProvider";
export { useEnrichment } from "./enrichment/useEnrichment";
export type { EnrichmentSourceType, IdeaData } from "./enrichment/useEnrichment";
```

- [ ] **Step 2: Inspecionar o AppShell**

Run:

```bash
sed -n '1,60p' components/layout/AppShell.tsx
```

Identificar onde os `children` são renderizados (dentro do shell, ao lado do Sidebar).

- [ ] **Step 3: Envolver o conteúdo com o provider**

Em `components/layout/AppShell.tsx`, importar e envolver a área de conteúdo:

```tsx
import { EnrichmentProvider } from "@/components/ds";
```

E envolver o `{children}` (ou o container principal) com `<EnrichmentProvider>...</EnrichmentProvider>`. O provider deve ficar DENTRO do shell para que o modal apareça sobre toda a app, mas pode envolver apenas `{children}` — o importante é que todas as páginas com cards fiquem sob ele. Exemplo mínimo (ajustar ao JSX real):

```tsx
<EnrichmentProvider>{children}</EnrichmentProvider>
```

- [ ] **Step 4: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 5: Smoke — app carrega**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add components/ds/index.ts components/layout/AppShell.tsx
git commit -m "feat(enrichment): exporta e monta EnrichmentProvider no shell"
```

---

## Task 12: Selo + abertura do modal nos 3 cards

**Files:**
- Modify: `components/ds/OpportunityCard.tsx`
- Modify: `components/ds/InsightCard.tsx`
- Modify: `components/ds/ContentCard.tsx`

Cada card precisa: (a) props novas `sourceId?: string` e `enrichText?: string` (o texto puro da ideia); (b) consumir `useEnrichment()`; (c) mostrar estrela se `isInteresting`; (d) no clique do card, chamar `openEnrichment`. Como `InsightCard`/`ContentCard` não têm `onClick` de card hoje, adicioná-lo sem quebrar os botões internos (que já usam `stopPropagation` ou são `<button>` isolados).

- [ ] **Step 1: OpportunityCard**

Em `components/ds/OpportunityCard.tsx`:

1. No topo do arquivo: `import { useEnrichment } from "./enrichment/useEnrichment";` e `import { Icon } from "./Icon";` (se ainda não importado).
2. Adicionar às props (`OpportunityCardProps`): `sourceId?: string;` e `enrichText?: string;`.
3. Dentro do componente, antes do `return`:

```tsx
const enrichment = useEnrichment();
const interesting = enrichment && sourceId ? enrichment.isInteresting("opportunity", sourceId) : false;
const handleCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
  if (enrichment && sourceId) {
    enrichment.openEnrichment("opportunity", sourceId, { title: title ?? "", originalText: enrichText ?? pain ?? "" });
  }
  onSelect?.(e);
};
```

4. Trocar `onClick={onSelect}` por `onClick={handleCardClick}` no root div.
5. Ao lado do `<h3>{title}</h3>` (dentro do cabeçalho), quando `interesting`, mostrar a estrela:

```tsx
{interesting ? <Icon name="star" size={16} color="var(--brand)" /> : null}
```

- [ ] **Step 2: InsightCard**

Em `components/ds/InsightCard.tsx`:

1. `import { useEnrichment } from "./enrichment/useEnrichment";` (Icon já é importado).
2. Props (`InsightCardProps`): adicionar `sourceId?: string;` e `enrichText?: string;`.
3. No componente, antes do `return`:

```tsx
const enrichment = useEnrichment();
const interesting = enrichment && sourceId ? enrichment.isInteresting("insight", sourceId) : false;
const handleCardClick = () => {
  if (enrichment && sourceId) {
    enrichment.openEnrichment("insight", sourceId, { title: title ?? "", originalText: enrichText ?? description ?? "" });
  }
};
```

4. No root `<div className="ds-insight ...">`, adicionar `onClick={handleCardClick}` e `style={{ cursor: sourceId ? "pointer" : undefined, ... }}` (mesclar com o style existente). Os botões internos (`onChat`/`onMarkUseful`/`onDismiss`) já são `<button>` — adicionar `e.stopPropagation()` no início de cada handler chamado por eles OU envolver: como eles recebem handlers externos, garantir stopPropagation adicionando um wrapper. Solução simples: nos três `<button>`, trocar `onClick={onChat}` por `onClick={(e) => { e.stopPropagation(); onChat?.(e); }}` (idem para os outros dois).
5. Junto ao header (perto do `<span>{t.label}</span>` ou ao lado do título), mostrar a estrela quando `interesting`:

```tsx
{interesting ? <Icon name="star" size={14} color="var(--color-primary)" /> : null}
```

- [ ] **Step 3: ContentCard**

Em `components/ds/ContentCard.tsx`:

1. `import { useEnrichment } from "./enrichment/useEnrichment";` (Icon já importado).
2. Props (`ContentCardProps`): adicionar `sourceId?: string;` e `enrichText?: string;`.
3. Antes do `return`:

```tsx
const enrichment = useEnrichment();
const interesting = enrichment && sourceId ? enrichment.isInteresting("content", sourceId) : false;
const handleCardClick = () => {
  if (enrichment && sourceId) {
    enrichment.openEnrichment("content", sourceId, { title: title ?? "", originalText: enrichText ?? theme ?? "" });
  }
};
```

4. No root `<div className="ds-card ...">`, adicionar `onClick={handleCardClick}` e cursor pointer quando `sourceId`. Os botões de status (`onApprove`/`onDiscard`/`onPublish`) já são `<Button>` — envolver seus handlers com `stopPropagation`: trocar `onClick={onApprove}` por `onClick={(e) => { e.stopPropagation(); onApprove?.(e); }}` (idem discard/publish).
5. Junto ao header, estrela quando `interesting`:

```tsx
{interesting ? <Icon name="star" size={14} color="var(--brand)" /> : null}
```

- [ ] **Step 4: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0. (Se `Icon name="star"` não existir, ver Task 10 Step 2 para trocar pelo ícone equivalente disponível.)

- [ ] **Step 5: Commit**

```bash
git add components/ds/OpportunityCard.tsx components/ds/InsightCard.tsx components/ds/ContentCard.tsx
git commit -m "feat(enrichment): selo interessante + abrir modal nos cards"
```

---

## Task 13: Passar `sourceId`/`enrichText` nas páginas que usam os cards

**Files:**
- Modify: `app/page.tsx` (Dashboard)
- Modify: `app/oportunidades/page.tsx`
- Modify: `app/insights/page.tsx`
- Modify: `app/conteudos/page.tsx`

- [ ] **Step 1: Dashboard (`app/page.tsx`)**

Localizar cada uso de `<InsightCard ... />` e `<OpportunityCard ... />` (se houver) e adicionar `sourceId={item.id}` e `enrichText={...}`:
- `InsightCard`: `sourceId={i.id} enrichText={i.description}`.
- `OpportunityCard` (se usado): `sourceId={o.id} enrichText={o.pain}`.

Confirmar os usos com:

```bash
grep -n "InsightCard\|OpportunityCard\|ContentCard" app/page.tsx
```

- [ ] **Step 2: Oportunidades (`app/oportunidades/page.tsx`)**

No `<OpportunityCard ...>`, adicionar `sourceId={o.id}` e `enrichText={o.pain}`. O `StartProjectButton` no `action` permanece.

- [ ] **Step 3: Insights (`app/insights/page.tsx`)**

No `<InsightCard ...>`, adicionar `sourceId={i.id}` e `enrichText={i.description}`.

- [ ] **Step 4: Conteúdos (`app/conteudos/page.tsx`)**

No `<ContentCard ...>`, adicionar `sourceId={c.id}` e `enrichText={c.theme}`.

- [ ] **Step 5: Typecheck + smoke**

Run:

```bash
npx tsc --noEmit
for p in / /oportunidades /insights /conteudos; do echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000$p"; done
```

Expected: tsc exit 0; cada rota retorna `200`.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/oportunidades/page.tsx app/insights/page.tsx app/conteudos/page.tsx
git commit -m "feat(enrichment): passa sourceId/enrichText aos cards nas paginas"
```

---

## Task 14: Filtro "Só interessantes" nas 3 páginas de lista

**Files:**
- Modify: `app/oportunidades/page.tsx`
- Modify: `app/insights/page.tsx`
- Modify: `app/conteudos/page.tsx`

Cada página ganha um `FilterChip` "Só interessantes" que, quando ativo, filtra a lista pelos ids interessantes (via `useEnrichment().isInteresting`).

- [ ] **Step 1: Oportunidades**

Em `app/oportunidades/page.tsx`:
1. Importar o hook: `import { useEnrichment } from "@/components/ds";` (garantir que `FilterChip` já está importado — está).
2. No componente: `const enrichment = useEnrichment();` e `const [onlyInteresting, setOnlyInteresting] = useState(false);`.
3. Na expressão que produz a lista filtrada, adicionar a condição:

```tsx
.filter((o) => !onlyInteresting || (enrichment?.isInteresting("opportunity", o.id) ?? false))
```

4. Adicionar o chip perto dos filtros existentes:

```tsx
<FilterChip active={onlyInteresting} onClick={() => setOnlyInteresting((v) => !v)}>
  Só interessantes
</FilterChip>
```

- [ ] **Step 2: Insights**

Repetir em `app/insights/page.tsx`, usando `"insight"` e `i.id`. Adicionar `useEnrichment` ao import de `@/components/ds`, o estado `onlyInteresting`, a condição no `.filter` do `useMemo` `list`, e o chip junto aos outros `FilterChip`.

- [ ] **Step 3: Conteúdos**

Repetir em `app/conteudos/page.tsx`, usando `"content"` e `c.id`.

- [ ] **Step 4: Typecheck + smoke**

Run:

```bash
npx tsc --noEmit
for p in /oportunidades /insights /conteudos; do echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000$p"; done
```

Expected: tsc exit 0; cada rota `200`.

- [ ] **Step 5: Commit**

```bash
git add app/oportunidades/page.tsx app/insights/page.tsx app/conteudos/page.tsx
git commit -m "feat(enrichment): filtro 'So interessantes' nas listas"
```

---

## Task 15: Item de menu + página "Assuntos de Interesse"

**Files:**
- Modify: `components/layout/Sidebar.tsx`
- Create: `app/assuntos-interesse/page.tsx`

- [ ] **Step 1: Adicionar o item de menu**

Em `components/layout/Sidebar.tsx`, no array `ITEMS`, inserir após o item de Conteúdos:

```ts
{ icon: "star", label: "Assuntos de Interesse", path: "/assuntos-interesse" },
```

O stem `star` JÁ FOI VERIFICADO em `public/icons/star-regular.svg` — usar `"star"` direto.

- [ ] **Step 2: Criar a página**

Create `app/assuntos-interesse/page.tsx`:

```tsx
"use client";
import useSWR from "swr";
import { useEnrichment, EmptyState } from "@/components/ds";
import { Icon } from "@/components/ds";

interface InterestingItem {
  enrichmentId: string;
  sourceType: "opportunity" | "insight" | "content";
  sourceId: string;
  notes: string | null;
  textOverride: string | null;
  updatedAt: string;
  refCount: number;
  title: string | null;
  subtitle: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TYPE_LABEL: Record<string, string> = {
  opportunity: "Oportunidade",
  insight: "Insight",
  content: "Conteúdo",
};

export default function AssuntosInteressePage() {
  const enrichment = useEnrichment();
  const { data, isLoading } = useSWR<{ data: InterestingItem[] }>(
    "/api/enrichment/interesting",
    fetcher,
    { revalidateOnFocus: false }
  );
  const items = data?.data || [];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Assuntos de Interesse</h1>
        <p style={{ color: "var(--color-muted-foreground)", margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>
          Ideias marcadas como interessantes, de todas as áreas.
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 140 }} />
          ))}
        </div>
      ) : items.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {items.map((it) => (
            <div
              key={it.enrichmentId}
              className="ds-card ds-card--clickable"
              style={{ display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}
              onClick={() =>
                enrichment?.openEnrichment(it.sourceType, it.sourceId, {
                  title: it.title ?? "Ideia",
                  originalText: it.textOverride ?? it.subtitle ?? "",
                })
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="star" size={16} color="var(--brand)" />
                <span className="ds-badge ds-badge--compact">{TYPE_LABEL[it.sourceType] || it.sourceType}</span>
              </div>
              <h3 style={{ font: "400 16px/24px var(--fontFamily)", margin: 0 }}>{it.title || "(sem título)"}</h3>
              {it.subtitle ? (
                <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{it.subtitle}</p>
              ) : null}
              {it.notes ? (
                <p style={{ margin: 0, font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>📝 {it.notes}</p>
              ) : null}
              <span style={{ marginTop: "auto", font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                {it.refCount} referência{it.refCount !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="star" title="Nenhum assunto de interesse" message="Marque ideias como interessantes nos cards para vê-las aqui." />
      )}
    </div>
  );
}
```

> Se `EmptyState` não aceitar `icon="star"`, usar um ícone existente (ex.: `"file-text"`).

- [ ] **Step 3: Typecheck + smoke**

Run:

```bash
npx tsc --noEmit
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/assuntos-interesse
```

Expected: tsc exit 0; rota `200`.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx app/assuntos-interesse/page.tsx
git commit -m "feat(enrichment): pagina Assuntos de Interesse + item de menu"
```

---

## Task 16: Verificação ponta-a-ponta (E2E manual)

**Files:** nenhum (só verificação)

- [ ] **Step 1: Fluxo completo via UI**

Com o dev server rodando, abrir `http://127.0.0.1:3000/oportunidades`, clicar num card → o modal abre. No modal:
1. Editar o texto → deve mostrar "(editado)" e salvar (aguardar ~1s).
2. Escrever uma observação.
3. Adicionar um link (título + URL) → aparece na lista.
4. Fazer upload de uma imagem pequena (<5 MB) → thumbnail aparece.
5. Marcar como "Interessante" (estrela fica ativa).
6. Fechar o modal → o card deve exibir a estrela.

- [ ] **Step 2: Página de interesse**

Abrir `http://127.0.0.1:3000/assuntos-interesse` → a ideia marcada aparece com badge do tipo, observação e contagem de referências. Clicar reabre o modal com os dados carregados.

- [ ] **Step 3: Criar projeto enriquecido**

No modal, clicar "Criar Projeto" → navega para `/projetos/[id]`. Verificar (via UI ou query) que a `description` do projeto inclui o texto + observações + fontes:

```bash
npx tsx -e "import{Pool}from'pg';const p=new Pool({connectionString:process.env.MEETINGS_DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query('SELECT title, left(description, 400) AS d FROM app_projects ORDER BY created_at DESC LIMIT 1').then(r=>{console.log(r.rows[0]);return p.end();});"
```

Expected: a `description` contém as seções "Observações:" e "Fontes/Referências:".

- [ ] **Step 4: Limpeza dos dados de teste E2E**

Remover o enriquecimento e (opcional) o projeto de teste criados no fluxo manual, se desejar, via SQL direcionado ao `source_id` usado. (Não obrigatório — dados reais podem permanecer.)

- [ ] **Step 5: Typecheck final + lint**

Run:

```bash
npx tsc --noEmit && npx eslint app components lib --max-warnings=0 || npx eslint .
```

Expected: tsc exit 0; lint sem erros novos introduzidos por estas mudanças (avisos pré-existentes em outros arquivos podem ser ignorados).

- [ ] **Step 6: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(enrichment): ajustes finais pos-verificacao E2E"
```

---

## Notas de segurança (recap)
- Todas as operações de Storage usam `SUPABASE_*_SISTEMA`. **Nunca** `*_EMBEDINGS`.
- Service-role key só no servidor (`lib/supabaseStorage.ts`, rotas). Nunca exposta ao cliente.
- Nenhuma alteração em tabelas de origem, no Clone, embeddings, Plaud ou n8n.
- Nenhum segredo impresso; `.env` nunca commitado.
