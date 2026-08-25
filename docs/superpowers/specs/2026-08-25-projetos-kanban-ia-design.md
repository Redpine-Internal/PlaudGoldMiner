# Projetos (ideias vivas) + Kanban configurável + IA — Design

**Data:** 2026-08-25
**App:** ehs-insights (Andreza AI) — Next.js 16 App Router, TypeScript, Postgres (Supabase) via `pg` Pool + Drizzle.

## Objetivo

Transformar cada card de ideia (Oportunidade / Insight / Conteúdo) de um item estático
em uma **ideia viva**: iniciar um **Projeto** a partir do card, com um **Kanban de colunas
configuráveis**, e **4 ações de IA** que geram tarefas acionáveis dentro do projeto.

## Decisões (todas confirmadas com o usuário)

- **Formato da interação:** ações guiadas + tarefas (não chat livre).
- **Ações de IA (v1):** Aprofundar a ideia, Virar projeto/plano, Riscos & perguntas abertas, Gerar conteúdo.
- **Card do Kanban =** Tarefas / próximos passos (fluxo de execução).
- **Escopo v1:** completo — Projetos + Kanban (drag-and-drop) + IA.
- **Colunas configuráveis por projeto** (renomear, adicionar, remover, reordenar).
  Seed inicial em inglês: **Backlog / To Do / Doing / Done**.
- **Remover coluna:** bloqueado se a coluna tiver tarefas (aviso pedindo mover/excluir antes).
- **IA cria tarefas sempre na 1ª coluna (Backlog).**
- **Botão "Iniciar Projeto":** nos 3 tipos de card (Oportunidade/Insight/Conteúdo).
  Vira "Abrir Projeto" quando já existe projeto para aquela ideia.
- **Drag-and-drop:** HTML5 nativo (draggable/onDragOver/onDrop), zero dependências novas.

## Modelo de dados (3 tabelas novas, padrão `app_*`, PKs text/uuid via crypto.randomUUID())

### app_projects
| coluna | tipo | notas |
|---|---|---|
| id | text | PK |
| title | text notNull | herdado da ideia, editável |
| description | text | resumo da ideia |
| status | text notNull default 'ativo' | ativo / pausado / arquivado |
| source_type | text | 'opportunity' / 'insight' / 'content' |
| source_id | text | id do card de origem |
| created_at | timestamptz notNull defaultNow | |

Índices: `source_type`+`source_id` (idx para "já existe projeto?"), `status`.

### app_project_columns
| coluna | tipo | notas |
|---|---|---|
| id | text | PK |
| project_id | text notNull | FK lógico → app_projects.id |
| name | text notNull | editável |
| position | real notNull | ordem das colunas |
| created_at | timestamptz notNull defaultNow | |

Índice: `project_id`.
Seed ao criar projeto: Backlog(pos 1000), To Do(2000), Doing(3000), Done(4000).

### app_project_tasks
| coluna | tipo | notas |
|---|---|---|
| id | text | PK |
| project_id | text notNull | FK lógico → app_projects.id |
| column_id | text notNull | FK lógico → app_project_columns.id |
| title | text notNull | |
| detail | text | markdown; corpo do output da IA |
| kind | text notNull default 'manual' | manual / ai:aprofundar / ai:plano / ai:riscos / ai:conteudo |
| position | real notNull | ordem dentro da coluna |
| created_at | timestamptz notNull defaultNow | |

Índices: `project_id`, `column_id`.

**Posicionamento (`position` real):** novos itens = (maior position da coluna) + 1000.
Reordenar entre dois vizinhos = média das posições. Evita reescrever a coluna inteira.

## Fluxo do usuário

1. Card de ideia (Oportunidade/Insight/Conteúdo) mostra botão **Iniciar Projeto** /
   **Abrir Projeto** (se já existe projeto com source_type+source_id).
2. Iniciar → cria app_projects + 4 colunas seed → navega para `/projetos/[id]`.
3. Tela do projeto: header com título/descrição + as 4 ações de IA.
   Cada ação chama a IA com o contexto da ideia e cria tarefas na coluna Backlog.
4. Kanban: arrastar tarefas entre colunas; criar/editar/excluir tarefa manual;
   renomear/adicionar/remover/reordenar colunas.
5. Menu lateral: nova entrada **Projetos** → lista `/projetos`.

## Backend (rotas REST, padrão das rotas existentes)

- `GET /api/projects` — lista (com total real via COUNT).
- `POST /api/projects` — cria projeto + 4 colunas seed. Body `{ title, description, sourceType, sourceId }`.
- `GET /api/projects/[id]` — projeto + colunas + tasks (para render do board).
- `PATCH /api/projects/[id]` — editar title/description/status.
- `DELETE /api/projects/[id]` — remover projeto (cascade colunas+tasks em app).
- `POST /api/projects/[id]/columns` — nova coluna. `PATCH /api/columns/[id]` (rename/reorder).
  `DELETE /api/columns/[id]` — 409 se tiver tasks.
- `POST /api/projects/[id]/tasks` — nova task. `PATCH /api/tasks/[id]` (title/detail/column_id/position).
  `DELETE /api/tasks/[id]`.
- `POST /api/projects/[id]/generate` — body `{ action: 'aprofundar'|'plano'|'riscos'|'conteudo' }`.
  Roda o AI service, insere tasks na 1ª coluna (Backlog), retorna as tasks criadas.

## IA — lib/ai/services/project-action-generator.ts

Segue o padrão de `cross-insight-analyzer.ts`:
- `generateObject({ model: anthropic(DEFAULT_MODEL), schema, system, prompt })` com retry (RETRY_CONFIG).
- Schema Zod: `{ tasks: { title: string; detail: string }[] }`.
- 4 prompts (system+user) por ação, em `lib/ai/prompts/project-actions.ts`.
- Contexto de entrada: título + descrição + (dor/pattern conforme o source_type).
- Retorno `{ success: true, data } | { success: false, error }`.

## Frontend

- `app/projetos/page.tsx` — lista de projetos (cards), botão para arquivar/abrir.
- `app/projetos/[id]/page.tsx` — board Kanban:
  - Header: título/descrição editáveis, status.
  - Barra de ações de IA (4 botões, icon sparkles, spinner, erro inline — padrão insights/page).
  - Colunas horizontais com tasks arrastáveis; add-column; add-task; menu de coluna (rename/delete).
- `components/ds` novos: `KanbanBoard`, `KanbanColumn`, `TaskCard` (ou inline na página se preferir mínimo).
- Sidebar: item `{ icon: "layout-dashboard"/"apps", label: "Projetos", path: "/projetos" }`.
- Botão "Iniciar/Abrir Projeto" nos cards das 3 seções (via os *Card components* do ds
  ou via ação na própria página de lista, a definir no plano para menor acoplamento).

## Erros / edge cases

- Criar projeto duplicado para a mesma ideia: detectar por source_type+source_id → "Abrir".
- DELETE coluna com tasks → 409 + mensagem.
- IA falha/timeout → erro inline, nenhuma task criada (transação por ação).
- Reorder concorrente → position real tolera; PATCH idempotente.
- `crypto.randomUUID()` para todos os ids (padrão do persist-result.ts).

## Restrições (herdadas do projeto)

- NÃO tocar Clone / embeddings / pgvector / Plaud / workflows n8n 01/03/07.
- Tabelas novas com prefixo `app_`. Nada destrutivo sem ok.
- Segredos mascarados; .env/local.db/meetings_access nunca versionados.

## Não é git

O diretório não é um repositório git; sem worktree/commit. Spec e plano ficam em
docs/superpowers/. Migração de schema aplicada diretamente no Postgres (Supabase).
