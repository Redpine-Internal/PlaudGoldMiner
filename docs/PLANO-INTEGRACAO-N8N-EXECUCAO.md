# Plano de Execução — Integração ehs-insights ↔ n8n (agentes reais)

> Status: **proposta para aprovação**. Nenhum código de fluxo foi alterado.
> Data: 2026-08-21
> Base: complementa `docs/PLANO-INTEGRACAO-N8N.md` (proposta de arquitetura, 2026-08-19).

## 1. Onde estamos hoje (fatos verificados no código)

- App: **Next.js App Router + Drizzle/SQLite (`local.db`) + Azure OpenAI** (`lib/ai/client.ts`).
  O alias `anthropic` na verdade resolve para Azure OpenAI (deployment `gpt-5.6-terra`).
- **Integração n8n existe mas está quase toda desligada.** `lib/n8n/client.ts` mapeia os **7 webhooks**,
  porém o **único** consumidor real é `app/api/n8n/status/route.ts` (só ping de reachability).
- Todo o "trabalho de IA" roda **local**, sempre no mesmo padrão:

  | Rota | Serviço local chamado | Persiste em (SQLite) |
  |---|---|---|
  | `POST /api/process` | `processTranscription()` | `conversations`, `opportunities` |
  | `POST /api/plaud/analyze` | `processTranscription()` | idem (upsert por `sourceFileId`) |
  | `POST /api/insights/analyze` | `cross-insight-analyzer` | `cross_insights` |
  | `POST /api/contents/analyze` | `content-suggestion-generator` | `contents` |
  | `POST /api/clone/chat` | `lib/ai` | — |

- Tabelas locais (Drizzle): `conversations`, `opportunities`, `contents`, `content_sources`,
  `cross_insights`, `cross_insight_conversations`, `user_profile`.
- `.env` já tem: `N8N_API_KEY`, `N8N_WEBHOOK_URL`, `SUPABASE_URL_SISTEMA`, chaves `_EMBEDINGS` e `_SISTEMA`.
  **Falta** `N8N_WEBHOOK_SECRET` (o client `lib/n8n/client.ts` espera esse nome).

## 2. Ponto de troca (o mesmo em todas as rotas)

Cada rota faz: `const result = await processXxx(local)` → `persistLocal(result)`.
A integração troca **exatamente essa linha** por: `callWebhook(id, payload)` → (polling 06) → ler resultado.
Nada na UI muda de imediato — só a fonte do processamento. Isso torna cada fase pequena e reversível.

## 3. Estratégia: feature flag por agente (não-destrutivo)

Adicionar um seletor de origem por capacidade, default = `local` (comportamento atual):

```
# .env
N8N_WEBHOOK_SECRET=<a fornecer>
AI_SOURCE_MEETING=local        # local | n8n   (webhook 01)
AI_SOURCE_OPPORTUNITIES=local  # local | n8n   (webhook 02)
AI_SOURCE_SOCIAL=local         # local | n8n   (webhook 05)
```

Um helper `resolveSource('meeting'|'opportunities'|'social')` decide, em runtime, se a rota chama
o serviço local ou `callWebhook`. **Rollback = trocar a flag para `local`** (sem deploy de código).

## 4. Mapa: os 7 webhooks × telas do app

| n8n | Escreve/lê | Tela | Situação | Fase |
|---|---|---|---|---|
| 01 process-meeting | `meetings`,`summaries`,pgvector | Conversas | local hoje | **C** |
| 02 business-opportunities | `business_opportunities` | Oportunidades | local hoje | **D** |
| 05 social-content | `social_posts` | Conteúdos | local hoje | **D** |
| 06 execution-status | lê `agent_executions` (polling) | infra | ✅ ligado | **B** |
| 03 embedding-compare | RAG em `base_clone` (416 chunks) | Clone/Busca | inexistente | **E** |
| 07 embedding-approve | curadoria → `base_clone` | (nova) | inexistente | **E** |
| 04 article-insights | `article_insights` | (nova) | inexistente | **E** |

## 5. Fases (back-end primeiro, incremental, reversível)

### Fase A — Fechar a camada de conexão (0 risco)
- Adicionar `N8N_WEBHOOK_SECRET` ao `.env` (depende de #Dependências).
- Confirmar esquema de auth real dos webhooks (header vs bearer) — inspecionar nó "Validate Auth" do 02.
- Endpoint de diagnóstico já existe (`/api/n8n/status`); adicionar teste de POST autenticado a 1 webhook.
- **Entregável:** `GET /api/n8n/status` mostrando reachable + auth OK.

### Fase B — Tracking assíncrono (pré-requisito dos agentes)
- `lib/n8n/poll-execution.ts`: dispara agente → recebe `executionId` → faz polling no webhook 06 até `completed`/`error` (timeout + backoff).
- Expor estado por-agente pro front (loading/erro).
- **Entregável:** helper testado contra 1 execução real.

### Fase C — Conversas via webhook 01  ← **começar por aqui**
- Motivo: é o fluxo **já validado** (Plaud→n8n TESTE, 226 meetings summarized).
- `resolveSource('meeting')`: quando `n8n`, `/api/plaud/analyze` e `/api/process` disparam webhook 01 em vez de `processTranscription()`.
- Leitura: criar **webhook GET de leitura** (meetings+summaries) OU ler o Postgres operacional — ver #Dependências.
- Tela **Conversas** passa a exibir dados reais quando a flag = `n8n`.
- **Rollback:** `AI_SOURCE_MEETING=local`.

### Fase D — Oportunidades (02) e Conteúdos (05)
- Mesmo padrão: botão "gerar" → webhook → polling 06 → lê resultado.
- Flags `AI_SOURCE_OPPORTUNITIES`, `AI_SOURCE_SOCIAL`.

### Fase E — Capacidades novas (não existem no app hoje)
- **Busca semântica (03):** nova tela/campo consultando `base_clone` (RAG, 416 chunks). Puro ganho.
- **Curadoria de embeddings (07):** tela de approval cards → alimenta `base_clone`.
- **Artigos científicos (04):** nova tabela/tela `article_insights`.

### Fase F — Descontinuar processamento local
- Depois que C–E cobrirem os casos, arquivar `lib/ai/services/*`.
- SQLite vira cache de UI (ou é aposentado); fonte da verdade = Postgres operacional via n8n.

## 6. Dependências que só VOCÊ fornece (bloqueiam A/C)

1. **`N8N_WEBHOOK_SECRET` / esquema de auth** dos webhooks Plaude (ou autorização p/ inspecionar o nó `Validate` do 02).
2. **Leitura de dados operacionais** — hoje só o 06 lê. Para listar meetings/oportunidades no front, escolher:
   (a) criar webhooks GET no n8n, (b) me autorizar a criá-los via API n8n, ou (c) liberar a connection string do Postgres `Agentes_plaude` para leitura direta.
3. **Promoção do webhook 01** (fix já validado no TESTE) para produção — ver `promocao_prod/PLANO_PROMOCAO_PRODUCAO.md` (coluna `metadata`, `source`, autorização de escrita no workflow).

## 7. Ordem recomendada de execução
**A → B → C** (entrega valor cedo: Conversas reais) **→ D → E → F**.
Cada fase é isolada por feature flag e reversível sem deploy.

## 8. Primeiro passo concreto (após aprovação)
Fase A: adicionar `N8N_WEBHOOK_SECRET` + `resolveSource()` (default `local`) + teste de POST autenticado.
Nenhum fluxo existente muda enquanto as flags ficarem em `local`.
