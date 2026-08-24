# Fase 5 — Remover resíduos SQLite/libSQL/Turso

**Data:** 2026-08-24
**Status:** Aprovado para plano

## Objetivo

Eliminar todo o código, dependências e artefatos da antiga camada libSQL/Turso/SQLite.
O runtime da app já roda 100% em Postgres (Supabase) via `drizzle-orm/node-postgres` +
`pg.Pool`, então **nada em runtime muda**. Esta fase é limpeza de resíduos inertes.

## Contexto (verificado ao vivo em 2026-08-24)

- `lib/db/index.ts` **já** usa `drizzle(pool)` sobre `pg.Pool` apontando para
  `MEETINGS_DATABASE_URL` (Supabase `rxugnepuvdhsmibakyij`). A antiga camada libSQL
  foi aposentada aqui.
- `lib/db/schema.ts` **já** declara tudo como `pgTable` (dialeto pg-core). Válido.
- A instância Drizzle `db` é importada por ~20 rotas + `lib/n8n/enrich.ts`,
  `lib/plaud/ingest.ts`, `lib/ai/persist-result.ts`. Todas rodam sobre Postgres.
- **Nenhum** uso de API sqlite-style do Drizzle (`.run`/`.all`/`.get`) no código-fonte.
- `@libsql/client` é importado em **um único** lugar: `scripts/setup-db.mjs`
  (seeder do `local.db`, obsoleto).
- `drizzle.config.ts` ainda tem `dialect: 'turso'` + credenciais Turso.
- `lib/db/migrations/*.sql` estão em **dialeto SQLite** (backticks, `strftime`,
  `real`) — inválidos para Postgres. O schema real do cloud já foi criado por fora
  nas Fases 1–4, então essas migrations não servem.
- `local.db` (487 KB, git-ignored) presente no working dir.

## Princípio-chave

Drizzle **fica** (agora sobre Postgres; ~20 rotas dependem da instância `db` e do
`schema.ts` em `pgTable`). Só sai a camada libSQL/Turso e o CLI de migração que a servia.

## Escopo (decidido com o usuário)

Remover **só o lixo libSQL/Turso**. Não remover Drizzle ORM, não regenerar migrations
Postgres, não reescrever rotas para SQL cru.

## Itens a remover/alterar

| # | Item | Ação |
|---|---|---|
| 1 | `@libsql/client` (dependency) | remover de `package.json` + `package-lock.json` |
| 2 | `scripts/setup-db.mjs` | deletar (seeder do `local.db` SQLite) |
| 3 | `drizzle.config.ts` | deletar (`dialect: 'turso'` + creds Turso) |
| 4 | `lib/db/migrations/` (2 `.sql` + `meta/`) | deletar pasta inteira (dialeto SQLite) |
| 5 | scripts `db:generate` / `db:push` / `db:studio` | remover de `package.json` |
| 6 | `drizzle-kit` (devDependency) | remover — sem uso após #3/#4/#5 |
| 7 | `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | remover de `.env.example` e `.env` |
| 8 | `local.db` (487 KB) | deletar do disco (OK explícito do usuário) |

**Nota sobre #6:** com `drizzle.config.ts`, migrations e os 3 scripts `db:*` removidos,
o `drizzle-kit` (CLI de migração) fica sem uso — só o `drizzle-orm` (runtime) permanece.

## O que NÃO muda (verificado)

- `lib/db/index.ts` — pool Postgres + `drizzle(pool)`. Intacto.
- `lib/db/schema.ts` — `pgTable`. Intacto.
- As ~20 rotas que usam `{ db }` e `{ pool }`. Zero edição.

## Verificação (sem framework de testes)

1. `grep` garante zero referências a `libsql`, `turso`, `local.db`, `setup-db`,
   `drizzle.config` no código-fonte (fora de `node_modules`/`.next`).
2. `npx tsc --noEmit` limpo.
3. `npx eslint` limpo.
4. `npm ls drizzle-kit @libsql/client` → "not found" (deps fora do tree).
5. Smoke: uma rota que usa `db` (ex.: `/api/conversations`) e uma que usa `pool`
   (ex.: `/api/agents/executions`) ainda tipam contra o Postgres.

## Erros / riscos

- **Baixo.** Único risco real seria uma import residual de `@libsql/client` fora de
  `setup-db.mjs` — confirmado via grep que **não existe**.
- `drizzle-kit` é build-time only; removê-lo não afeta runtime nem `next build`.
- `local.db` é git-ignored e fora de runtime; deletá-lo é seguro (dados já migrados
  para o Supabase nas Fases 1–4).

## Fora de escopo (YAGNI)

- Remover Drizzle ORM.
- Regenerar migrations em dialeto Postgres.
- Reescrever rotas para SQL cru via `pool`.

## Segurança

- `.env`, `local.db` e `~/Redpine/meetings_access` nunca vão ao GitHub (`.env` e
  `local.db` git-ignored; `meetings_access` fora do repo).
- Segredos mascarados em qualquer saída.
