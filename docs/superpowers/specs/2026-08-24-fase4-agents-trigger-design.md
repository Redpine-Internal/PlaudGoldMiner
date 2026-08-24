# Fase 4 — App dispara agentes n8n (trigger + track)

**Data:** 2026-08-24
**Status:** Aprovado para plano

## Objetivo

Permitir que o app acione os 3 agentes de IA do n8n (business, article, social)
sobre reuniões já resumidas no Postgres, e acompanhe o andamento — sem rodar IA
no app e **sem alterar nenhum workflow do n8n**.

## Contexto (verificado ao vivo em 2026-08-24)

- `meetings`: 226 linhas, todas `source=plaud-mcp status=summarized`.
- `summaries`: 226 linhas, com `summary_text`, `positive_points`, `key_topics`
  populados (226/226) — insumo pronto para os agentes.
- Tabelas de saída `business_opportunities`, `article_insights`, `social_posts`: **0 linhas**.
- `agent_executions`: **0 linhas** — tabela de rastreio (colunas: `id uuid`,
  `agent_name text`, `triggered_by text`, `meeting_ids uuid[]`, `input_params jsonb`,
  `status text`, `result_id uuid`, `result_table text`, `completed_at timestamptz`,
  `created_at timestamptz`).
- `agent_prompts`: prompts por `agent_name` (business/article/social/...) vivem no
  banco — o app **não** envia prompt.
- `meetings` **não** tem coluna de usuário (sem `user_id`/`owner_id`/`created_by`).

### Contrato dos webhooks (idêntico nos 3, confirmado nos nós `Validate`)

Cada workflow (02/04/05) já:
1. valida header `x-plaude-api-key` contra a chave fixa de 64 chars;
2. exige body `{ user_id, meeting_ids }` (senão `throw 'user_id and meeting_ids required'`);
3. grava `agent_executions` (`status=running` → `completed`, com `result_table`/`result_id`);
4. lê `SELECT * FROM summaries WHERE meeting_id IN (...)`;
5. roda a IA e grava sua tabela de saída.

| agente   | webhook id (types.ts)     | path                            | opções aceitas                              |
|----------|---------------------------|---------------------------------|---------------------------------------------|
| business | `business-opportunities`  | `/webhook/plaude-business-opportunities` | `date_range_start`, `date_range_end` |
| article  | `article-insights`        | `/webhook/plaude-article-insights`       | `focus_area`                         |
| social   | `social-content`          | `/webhook/plaude-social-content`         | `platforms`, `content_types`, `tone` |

**Conclusão:** o lado n8n já consome meetings do banco. O buraco é 100% app-side:
disparar os webhooks com `{ user_id, meeting_ids }` + header, e ler `agent_executions`
para status. As tabelas de saída já são lidas pela UI (Fase 2).

## Decisões

1. **`user_id` = valor fixo do operador**, via env `N8N_DEFAULT_USER_ID`.
   - Valor: `andreza@ehsbrasil.com`. É `text` livre (não precisa ser UUID).
   - Justificativa: app de operador único; `meetings` não tem dono; o campo é só
     rótulo de rastreio (`agent_executions.triggered_by` + `<tabela>.user_id`).
2. **Sem mudança no n8n.** Autorizado a inspecionar via API; inspeção concluída,
   nenhuma alteração necessária.
3. **Status via banco**, não via webhook 06. O app lê `agent_executions` direto
   pelo `pool` (mesma abordagem direta-Postgres das Fases 1–3), por `id` das execuções.
4. **Disparo é fire-and-forget assíncrono.** O POST ao webhook retorna rápido; o
   agente roda em background no n8n. O app confia no `agent_executions` para o resto.

## Arquitetura

```
UI  ──POST /api/agents/{business|article|social}  { meetingIds, ...opts }
      │  app injeta user_id (env) + header x-plaude-api-key (callWebhook já faz)
      ▼
   webhook n8n ──► agent_executions(running) ─► summaries ─► IA ─► tabela saída
                                              └► agent_executions(completed,result_*)
      ▲
UI  ──GET /api/agents/executions?agent=…&limit=…  ──► lê agent_executions (pool)
UI  ──(Fase 2, já existe) lê business_opportunities / article_insights / social_posts
```

## Componentes (unidades com fronteira clara)

### 1. `lib/n8n/agents.ts` (novo) — camada de disparo

Uma função por agente, fina, reusando `callWebhook` de `lib/n8n/client.ts`.

- `N8N_DEFAULT_USER_ID` lido do env (fallback: string vazia → erro claro no handler).
- `triggerBusiness(meetingIds, opts?)`, `triggerArticle(...)`, `triggerSocial(...)`.
- Cada uma monta `{ user_id, meeting_ids, ...opts }` e chama
  `callWebhook('<id>', payload)`. Retorna o `N8nResult` cru (o handler traduz p/ HTTP).
- **Responsabilidade única:** montar payload correto + disparar. Não toca no banco,
  não valida entrada (isso é do handler/zod).

### 2. `app/api/agents/[agent]/route.ts` (novo) — 1 rota dinâmica p/ os 3 disparos

- `POST`. `params.agent ∈ {business, article, social}` (whitelist; fora → 404).
- Body validado com zod:
  - comum: `meetingIds: string[].min(1)` (uuid cada);
  - business: `dateRangeStart?`, `dateRangeEnd?`;
  - article: `focusArea?`;
  - social: `platforms?: string[]`, `contentTypes?: string[]`, `tone?`.
- Se `N8N_DEFAULT_USER_ID` ausente → 500 com mensagem clara (config faltando).
- Chama a função de disparo correspondente; mapeia `N8nResult`:
  - `ok` → 202 Accepted `{ data: { triggered: true, agent, meetingIds } }`;
  - `!ok` → repassa `status` (ou 502) + `{ error }`.
- **Nota:** o webhook não devolve o `execution_id` (o n8n gera ao gravar
  `agent_executions`). Por isso o rastreio é por consulta ao banco (componente 3),
  não pelo retorno do POST.

### 3. `app/api/agents/executions/route.ts` (novo) — leitura de status

- `GET`. Query: `agent?` (filtro), `limit?` (default 20, max 100).
- `SELECT id, agent_name, triggered_by, meeting_ids, status, result_id,
  result_table, created_at, completed_at FROM agent_executions
  [WHERE agent_name=$1] ORDER BY created_at DESC LIMIT $n` via `pool`.
- Retorna `{ data: rows }`. Só-leitura, sem efeitos colaterais.

### 4. `.env` — `N8N_DEFAULT_USER_ID=andreza@ehsbrasil.com`

- Adicionado ao `.env` (não versionado). Documentar em `.env.example` se existir.

## Fluxo de dados

1. UI dispara → 202 imediato (agente roda async no n8n).
2. n8n grava `agent_executions(running)`, processa, grava saída + `(completed)`.
3. UI faz polling em `/api/agents/executions` até `status=completed`.
4. UI lê a tabela de saída (já implementado na Fase 2) e mostra o resultado.

## Erros

- **Config faltando** (`N8N_DEFAULT_USER_ID` vazio): 500 `{ error }` claro, logado.
- **n8n inalcançável / 4xx / 5xx**: `callWebhook` já devolve `{ ok:false, status?, error }`;
  handler repassa status (ou 502) sem vazar internals.
- **Body inválido**: zod → 400 com `details` (padrão idêntico ao de `plaud/ingest`).
- **agent fora da whitelist**: 404.
- **erro de banco no GET executions**: 500 `{ error: 'Internal server error' }`, logado.
- Segredos (`x-plaude-api-key`) nunca aparecem em resposta nem em log.

## Testes (sem framework — scripts tsx descartáveis, `node:assert/strict`)

1. `agents.ts`: payload montado corretamente por agente (mock de `callWebhook`);
   inclui `user_id` do env; inclui opts só quando fornecidas.
2. Rota `[agent]`: whitelist (business/article/social → ok; `xpto` → 404);
   body inválido → 400; config faltando → 500; sucesso → 202.
3. Rota `executions`: filtra por `agent`, respeita `limit`, ordena desc (contra o banco real, só-leitura).
4. `npx tsc --noEmit` limpo.

## Fora de escopo (YAGNI)

- Botões/telas de disparo na UI (esta fase entrega as rotas; o wiring de UI é fase seguinte se desejado).
- Retry/fila de disparo.
- Alterar workflows do n8n.
- Webhook 06 (polling) — substituído por leitura direta de `agent_executions`.

## Defeito latente observado (n8n, não bloqueia Fase 4)

Workflow 04 (`article`) nó `Update Execution` referencia
`$('Parse').first().json.execution_id`, mas o nó `Parse` **não** define `execution_id`
(define os campos do insight). Provável no-op no update final — não impede a gravação
em `article_insights` nem o `agent_executions(running)`. Registrado para correção
futura no n8n; **fora do escopo** desta fase (app-side).
