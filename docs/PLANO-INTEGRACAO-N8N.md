# Plano de Integração ehs-insights ↔ Infra Real (n8n + Supabase)

> Status: **proposta para aprovação**. Nenhum código foi alterado ainda.
> Data: 2026-08-19

## 0. Fatos confirmados (fonte da verdade = infra viva, não a spec)

- **n8n** `https://n8n-prd.mychatbot.us` está ATIVO. Os **7 workflows Plaude** existem, estão **ACTIVE** e batem com a spec:

  | # | Webhook (path real) | Escreve em | Modelo |
  |---|---------------------|-----------|--------|
  | 01 | `/webhook/4197f28e-25f3-4334-9fb0-2ea9ba58599e` (POST) | `meetings`, `summaries` + pgvector | gpt-4.1-mini |
  | 02 | `/webhook/plaude-business-opportunities` (POST) | `business_opportunities` | gpt-4.1-mini |
  | 03 | `/webhook/plaude-embedding-compare` (POST) | `embedding_approvals` (busca `base_clone`) | gpt-4.1-mini |
  | 04 | `/webhook/plaude-article-insights` (POST) | `article_insights` | gpt-4.1-mini |
  | 05 | `/webhook/plaude-social-content` (POST) | `social_posts` | gpt-4.1-mini |
  | 06 | `/webhook/plaude-execution-status` (POST) | lê `agent_executions` (polling) | — |
  | 07 | `/webhook/plaude-embedding-approve` (POST) | aprova/rejeita → `base_clone` | gpt-4.1-mini |

- **Dois bancos, papéis distintos:**
  - `Agentes_plaude` (Postgres, cred id `o3gIXQLqfynXzBOp`) = **base OPERACIONAL** (meetings, summaries, opportunities, article_insights, social_posts, agent_executions, agent_prompts, embedding_approvals). Connection string **criptografada no n8n** — só o dono do painel a vê. **NÃO é o Supabase SISTEMA da spec** (`hpoysbrgucqiiaaymyvc`), que segue pausado (NXDOMAIN).
  - `clone andreza` (Supabase `zhnphihrbdqaqmtgnafc`, o "EMBEDDINGS") = **base de conhecimento vetorial (RAG)**: `base_clone` (416 chunks), `n8n_chat_histories_2`. **Não é o banco da aplicação** — é a memória consultada pelo Comparador (03).

- **ehs-insights** hoje: Next.js App Router + Drizzle/Turso(SQLite) + Anthropic local. Já implementa ~60% da spec, mas processando localmente (não usa a infra real).

## 1. Decisão de arquitetura

**O n8n é a fronteira de I/O.** O ehs-insights **não** conecta direto no `Agentes_plaude` (connection string indisponível + isola o front do schema Postgres). Toda escrita já passa pelo n8n; a leitura também passará (webhooks GET de leitura a criar, além do 06 que já existe).

- **Turso/SQLite** deixa de ser a base operacional. Vira **cache/estado de UI** (opcional) ou é aposentado. Fonte da verdade = `Agentes_plaude` via n8n.
- **Ingestão Plaud** = via MCP (`mcp__plaud__*`) → dispara webhook 01.

## 2. Ordem de implementação (back-end/infra primeiro, como pedido)

### Fase A — Camada de conexão (não quebra nada)
- `lib/n8n/client.ts`: cliente tipado com os 7 webhooks + auth (header/secret conforme o n8n exige).
- `.env`: `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET` (ou o esquema de auth real dos webhooks — a validar no nó "Validate Auth").
- `lib/n8n/types.ts`: contratos de request/response de cada webhook (derivados dos nós `Validate`/`Parse`).

### Fase B — Tracking de execução assíncrona (pré-requisito de tudo)
- Os agentes respondem async → precisamos de `agent_executions` + polling (webhook 06).
- `lib/n8n/poll-execution.ts`: dispara agente → recebe `executionId` → faz polling no 06 até `completed`/`error`.
- Estado de execução exposto ao front (loading/erro por agente).

### Fase C — Migrar Conversas (webhook 01)
- Ingestão (MCP Plaud / upload / drive) → `POST` webhook 01 em vez de `transcription-processor.ts` local.
- Telas de Conversas passam a ler `meetings`+`summaries` reais (via webhook de leitura a criar).

### Fase D — Migrar Oportunidades (webhook 02)
- Botão "gerar oportunidades" → webhook 02 → polling 06 → lê `business_opportunities`.

### Fase E — Gaps novos (não existem no ehs-insights)
- **Busca semântica / Comparador (03)** + **fluxo de aprovação (07)**: nova tela de curadoria de embeddings (approval cards).
- **Artigos científicos (04)**: nova tabela/tela `article_insights`.
- **Social enriquecido (05)**: evoluir `contents` → `social_posts`.

### Fase F — Descontinuar processamento local
- Remover/arquivar `lib/ai/services/*` local depois que os webhooks cobrirem os casos.

## 3. Dependências que só VOCÊ pode fornecer

1. **Esquema de auth dos webhooks Plaude** — o nó "Validate Auth & Input" checa algo (secret/header). Preciso saber qual header/valor os webhooks esperam (ou me autorizar a inspecionar o nó `Validate` do 02 para extrair a regra).
2. **(Opcional) connection string do `Agentes_plaude`** — só se decidirmos leitura direta no Postgres em vez de webhooks de leitura. Por ora: **não necessária** (vamos de webhooks).
3. **Webhooks de leitura**: hoje só o 06 (status) lê dados. Para listar meetings/summaries/opportunities no front, ou (a) você cria webhooks GET no n8n, ou (b) me autoriza a criá-los via API n8n, ou (c) fornece o Postgres para leitura direta.

## 4. Próximo passo imediato (após aprovação)
Fase A: criar `lib/n8n/client.ts` + entradas `.env`, sem tocar em nenhum fluxo existente. Reversível e isolado.
