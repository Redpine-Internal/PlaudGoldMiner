# Enriquecimento de Ideias + Assuntos de Interesse — Design

**Data:** 2026-08-25
**Status:** Aprovado (aguardando revisão final do usuário)

## Objetivo

Permitir enriquecer uma ideia (card de Oportunidade, Insight ou Conteúdo) **antes** de
criar um projeto: abrir um modal ao clicar no card e, ali, ver/editar o texto gerado,
adicionar observações, marcar como **interessante**, anexar **fontes/referências**
(links) e **imagens** (upload real). Ao criar o projeto, ele herda esse contexto.
Todo card marcado como interessante aparece numa nova página **"Assuntos de Interesse"**.

A feature vale para **todos os cards do sistema** (Dashboard incluído), não apenas as
páginas de lista.

## Restrições travadas (OFF-LIMITS)

- **Não mexer em nada do Clone/embeddings.** Workflows 01/03/07, "Clone Andrezza",
  "Dados Plaud", pgvector — intocáveis.
- Persistir **fora** das tabelas de origem (oportunidades/insights/conteúdos): elas
  podem estar acopladas ao pipeline do Clone e algumas são views. Vínculo lógico via
  `(source_type, source_id)`, como `app_projects` já faz. **Sem FK** para elas.
- **Dois projetos Supabase distintos:** usar SEMPRE `SUPABASE_*_SISTEMA`. NUNCA as
  chaves `SUPABASE_*_EMBEDINGS`.
- Segredos mascarados em qualquer output; `.env`/`meetings_access`/`local.db` nunca
  vão para o GitHub. Nada destrutivo sem ok explícito.

## Arquitetura

Modal único global disparado por qualquer card, via um `EnrichmentProvider` montado no
`app/layout.tsx`. Persistência em tabelas novas `app_*` no banco SISTEMA
(`MEETINGS_DATABASE_URL`), acessadas por `pool.query` cru (padrão do projeto).
Imagens em um **bucket novo no Supabase Storage do projeto SISTEMA** (a ser criado
como etapa de setup — o projeto ainda não tem bucket).

Runtime é 100% Postgres; não há client Supabase no projeto hoje. Um helper novo e
isolado (`lib/supabaseStorage.ts`) cria o client de storage só no servidor, com a
service-role key do SISTEMA.

## Modelo de dados (banco SISTEMA)

Migração idempotente em `scripts/` (`CREATE TABLE IF NOT EXISTS`,
`CREATE UNIQUE INDEX IF NOT EXISTS`). Sem `DROP`, sem alterar tabela existente.
Rodada manualmente contra o SISTEMA.

### `app_idea_enrichment` (1 linha por ideia)

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | `crypto.randomUUID()` na API |
| `source_type` | text | `'opportunity' \| 'insight' \| 'content'` |
| `source_id` | text | id da ideia na tabela de origem |
| `interesting` | boolean NOT NULL DEFAULT false | dirige selo + página |
| `notes` | text NULL | observações do usuário |
| `text_override` | text NULL | texto gerado editado; NULL = usa o original |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | tocado a cada upsert |

- **UNIQUE `(source_type, source_id)`** → 1 enriquecimento por ideia. Upsert via
  `INSERT ... ON CONFLICT (source_type, source_id) DO UPDATE`.

### `app_idea_enrichment_reference` (N por enriquecimento)

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `enrichment_id` | uuid NOT NULL | FK → `app_idea_enrichment(id)` ON DELETE CASCADE |
| `kind` | text NOT NULL | `'link' \| 'image'` |
| `title` | text NULL | rótulo/fonte ("de onde veio a informação") |
| `url` | text NOT NULL | link externo, ou URL pública do objeto no bucket |
| `storage_path` | text NULL | caminho no bucket (só `kind='image'`, usado no delete) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

## API (rotas Next, `pool.query` cru)

Todas validam `sourceType ∈ {opportunity, insight, content}`.

### `/api/enrichment` (route.ts)
- **GET** `?sourceType&sourceId` → enriquecimento + referências (JOIN), ou
  `{ data: null }` se não existe. Usado ao abrir o modal.
- **PUT** body `{ sourceType, sourceId, interesting?, notes?, textOverride? }` →
  upsert `ON CONFLICT (source_type, source_id) DO UPDATE SET ..., updated_at = now()`.
  Retorna a linha.

### `/api/enrichment/reference` (route.ts)
- **POST** `{ sourceType, sourceId, kind, title?, url, storagePath? }` → garante o
  enrichment (upsert leve p/ obter `enrichment_id`), insere a referência, retorna-a.
- **DELETE** `?id=` → apaga a referência; se `kind='image'` com `storage_path`, remove
  também o objeto do bucket (best-effort; loga falha).

### `/api/enrichment/upload` (route.ts)
- **POST** `{ sourceType, sourceId, filename, contentType }` → valida `image/*` e
  tamanho (limite 5 MB), devolve **presigned upload URL** do Supabase Storage
  (SISTEMA) + `storagePath` + `publicUrl`. O browser faz PUT direto no Storage e
  depois chama `/api/enrichment/reference` com `kind='image'`.
- Path escopado: `enrichment/{sourceType}/{sourceId}/{uuid}-{filename}`.
- Client via `lib/supabaseStorage.ts` (service-role SISTEMA, só servidor).

### `/api/enrichment/interesting` (route.ts)
- **GET** → todos os enrichments com `interesting = true`, **já juntando** os dados de
  exibição da ideia via SELECT (leitura permitida) nas tabelas de origem
  (opportunities/insights/contents), + contagem de referências. Consumido pela página
  "Assuntos de Interesse" e pelo provider (para os selos).

**Segurança:** service-role só no servidor; presigned URL escopado; validação de
contentType e tamanho antes de emitir a URL.

## UI

### `EnrichmentProvider` (novo) — montado uma vez em `app/layout.tsx`
- Mantém **um** `GET /api/enrichment/interesting` (SWR) → `isInteresting(sourceType, sourceId)`.
- `openEnrichment(sourceType, sourceId, ideaData)` abre **um único** `IdeaEnrichmentModal` global.
- `mutate()` refresca selos após salvar.

### Cards (`OpportunityCard`, `InsightCard`, `ContentCard`)
- Consomem o contexto: clique do card → `openEnrichment(...)`; renderizam **selo de
  estrela** quando `isInteresting(...)`.
- Vale automaticamente em todas as telas (Dashboard, listas, Assuntos de Interesse) —
  zero código por página.
- `StartProjectButton` mantém `stopPropagation` (criar projeto ≠ abrir modal).
- **Fallback:** sem provider presente, o clique cai no `onSelect` atual — nada quebra.

### `IdeaEnrichmentModal` (novo) — instanciado uma vez pelo provider
Seções: (1) **Texto gerado** — textarea `textOverride ?? originalText`, salva override
(indicador "editado"); (2) **Observações** → `notes`; (3) **Interessante** — toggle
estrela, PUT otimista; (4) **Fontes/Referências** — links (título+url), add/remove;
(5) **Imagens** — input `image/*`: `POST upload` → PUT no Storage →
`POST reference kind=image`; thumbnails removíveis (DELETE + remove objeto).
Autosave com debounce nos campos de texto; toggle/refs salvam na hora. Footer:
**"Criar Projeto"** (reusa fluxo do `StartProjectButton`, enviando contexto enriquecido)
e **"Fechar"**. Erros com tokens `--alert-error-*`.

### Filtro "Só interessantes"
`FilterChip` novo nas 3 páginas de lista, filtra pelo set de ids interessantes
(vindo do provider, um fetch só).

### Página `/assuntos-interesse` + item no menu
- Item no `ITEMS` do Sidebar: `{ icon: "star", label: "Assuntos de Interesse", path: "/assuntos-interesse" }`, após "Conteúdos".
- Página: `GET /api/enrichment/interesting`, renderiza cards agregados dos 3 tipos com
  badge do tipo de origem; clicar reabre o modal; cada um com seu "Criar Projeto".

### Integração com criação de projeto
Ao criar, a `description` do projeto combina: texto (override ou original) +
observações + lista de fontes/referências. O projeto nasce com contexto rico. Sem
alterar as rotas de projeto além do body já aceito.

## Decisões travadas
- Armazenamento: **tabela dedicada** (não colunas nas tabelas de origem).
- Interessante: **selo (estrela) no card + filtro** + página dedicada.
- Imagens: **upload real** via **Supabase Storage (SISTEMA)**; bucket a criar.
- Texto gerado: **editável**, salvando override (sem tocar na origem).
- Rota `/api/enrichment/interesting` **junta** os dados de exibição da ideia (SELECT de leitura nas tabelas de origem), devolvendo tudo pronto.
- Selo = **estrela**; provider global com **um** modal compartilhado.

## Fora de escopo (YAGNI)
- Versionamento do `text_override` (campo único, sobrescreve).
- Compartilhamento/colaboração no enriquecimento.
- Qualquer alteração no pipeline Clone/embeddings/Plaud/n8n.
