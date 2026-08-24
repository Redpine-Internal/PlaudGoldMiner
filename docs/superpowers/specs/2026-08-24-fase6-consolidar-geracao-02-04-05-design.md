# Fase 6 — Consolidar geração 02/04/05 no app (desativar no n8n)

**Data:** 2026-08-24
**Status:** Aprovado para plano

## Objetivo

Trazer para o app as três gerações de dados que hoje rodam no n8n — **02
oportunidades de negócio**, **04 insights de artigos**, **05 conteúdo social** —
e desativar esses três workflows no n8n. A geração local já existe e roda; esta
fase reaponta a leitura da página Oportunidades, aposenta a camada de disparo
morta da Fase 4, e desativa os workflows 02/04/05 (reversível).

**Restrição inviolável:** não mexer em nada que atinge o Clone. Ficam intocados
os workflows 01 (process-meeting), 03 (embedding-compare), 07 (embedding-approve),
"Clone Andrezza", "Dados Plaud", e toda a camada de embeddings/pgvector.

## Contexto (verificado ao vivo em 2026-08-24)

- **Geração local já existe e a UI já a aciona:**
  - 04 insights → `app/page.tsx:74` faz `POST /api/insights/analyze` (local,
    `analyzeCrossConversations` → grava `crossInsights`).
  - 05 conteúdo → `app/conteudos/page.tsx:74` faz `POST /api/contents/analyze`
    (local, `generateContentSuggestions` → grava `contents` + `content_sources`).
  - 02 oportunidades → geradas no processamento da reunião
    (`transcription-processor` → `persist-result` → grava `app_opportunities`,
    1 linha por oportunidade).
- **Duas leituras ainda acopladas ao n8n:** `app/api/opportunities/route.ts`
  (lista) e `app/api/opportunities/[id]/route.ts` (detalhe), ambas fazendo
  `SELECT ... FROM business_opportunities` (tabela do n8n, jsonb 1→N) via
  `mapBusinessOpportunities` + `enrichWithConversation`. A rota `[id]` usa id
  sintético `${rowId}:${index}` porque o n8n agrupava N oportunidades por linha;
  em `app_opportunities` (1 linha/oportunidade) o id é o id real da linha, então
  o parsing sintético sai e o lookup vira `WHERE id = $1`.
- **Auditoria dos workflows 02/04/05** (IDs `QtMaHYa4gZSp27Yi`,
  `JRJnpROaHxDh9U9y`, `UEafFOcgOrcqtMfa`): estrutura idêntica de 12 nós
  (webhook → code → lê `summaries` → lê `agent_prompts` → LLM Azure **Chat**
  → code → grava tabela de resultado → grava `agent_executions` → responde).
  O nó `lc:lmChatAzureOpenAi` é o modelo de **chat** (texto), **não** embeddings.
  **Zero acoplamento com o Clone.** Desativá-los não corta nada que o Clone
  consome.
- **Camada de disparo da Fase 4 é código morto:** `grep` confirma que só
  `app/api/agents/[agent]/route.ts` importa `triggerBusiness/Article/Social`,
  e **nenhuma** parte da UI chama `/api/agents/*`. A UI usa exclusivamente as
  rotas locais acima.
- **`conv.topics` não é bug:** a coluna é `text` (JSON string) e
  `contents/analyze` faz `conv.topics ? JSON.parse(conv.topics) : []` —
  guardado. Verificado seguro; nenhuma correção necessária.

## Princípio-chave

Nenhuma geração nova é escrita — o código local dos três fluxos já existe e a UI
já o aciona. Esta fase só (a) reaponta uma leitura, (b) remove código morto de
disparo, e (c) desativa três workflows no n8n. Tudo reversível; Clone intocado.

## Escopo (decidido com o usuário)

Trazer 02/04/05 para o app e desativá-los no n8n. **Não** tocar em 01/03/07,
Clone Andrezza, Dados Plaud, nem em qualquer coisa de embedding/pgvector.

## Decisão sobre dados históricos

**Ignorar / não migrar** (confirmado: "vamos para 02/04/05"). A página
Oportunidades passa a ler de `app_opportunities`. A tabela `business_opportunities`
permanece **intacta no banco** (nada se perde); apenas deixa de ser lida. Não
se cria script de migração de histórico. Se no futuro quiserem trazer o
histórico do n8n, é decisão separada.

## Itens a alterar

| # | Item | Ação |
|---|---|---|
| 1 | `app/api/opportunities/route.ts` | reapontar `SELECT` de `business_opportunities` → `app_opportunities`, mapeando 1:1 para `OpportunityCard`; reusar `enrichWithConversation`; parar de importar `mapBusinessOpportunities`/`BusinessOpportunityRow` |
| 1b | `app/api/opportunities/[id]/route.ts` | reapontar para `app_opportunities` (`WHERE id = $1`, id real, sem parsing sintético); manter PATCH 405, mas corrigir a mensagem (fonte agora é local, não n8n) |
| 2 | `lib/n8n/agents.ts` | **deletar** (camada de disparo Fase 4, sem uso) |
| 3 | `app/api/agents/[agent]/route.ts` | **deletar** (rota de disparo, sem uso pela UI) |
| 4 | `app/api/agents/executions/route.ts` | **deletar** (GET de `agent_executions`, sem uso pela UI) |
| 5 | `lib/n8n/types.ts` | remover as chaves `business-opportunities`, `article-insights`, `social-content` do union `N8nWebhookId` e do mapa `N8N_WEBHOOKS` |
| 6 | n8n workflows 02/04/05 | `active=false` via API de gestão (reversível) |

### Detalhe do #1 — nova query de Oportunidades

`app_opportunities` já tem colunas que casam 1:1 com `OpportunityCard`
(`id`, `title`, `pain`, `score`, `type`, `status`, `conversation_id`), então
não há achatamento jsonb. Nova forma:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';

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

`enrichWithConversation` é genérico sobre `{ conversationId: string | null }` e
acrescenta `conversationTitle`/`conversationDate` — o shape resultante continua
compatível com o que a página Oportunidades consome. O campo `pain` é mantido
(faz parte de `OpportunityCard`).

### Detalhe do #5 — limpeza de `types.ts`

Após deletar `agents.ts`, confirmar por `grep` que nenhuma outra parte passa os
literais `'business-opportunities' | 'article-insights' | 'social-content'` a
`callWebhook`. `client.ts` consome o mapa genericamente; remover as três chaves
não quebra 01 (`process-meeting`), 03 (`embedding-compare`), 06
(`execution-status`), 07 (`embedding-approve`), que permanecem no union/mapa.

### Detalhe do #6 — desativação no n8n

Via API de gestão (`X-N8N-API-KEY`), `POST .../workflows/{id}/deactivate` (ou
`PATCH active=false`) para:

- 02 `QtMaHYa4gZSp27Yi` (business-opportunities)
- 04 `JRJnpROaHxDh9U9y` (article-insights)
- 05 `UEafFOcgOrcqtMfa` (social-content)

**Reversível** — não deleta o workflow. 01/03/07 e Clone permanecem `active`.

## O que NÃO muda (verificado)

- Fluxo do Clone: 01, 03, 07, "Clone Andrezza", "Dados Plaud", embeddings,
  pgvector — intocados.
- `lib/n8n/client.ts`, `lib/n8n/poll-execution.ts`, `execution-status` (06) —
  mantidos (usados fora do escopo de disparo removido).
- Tabelas `summaries`, `agent_prompts`, `business_opportunities` — não são
  dropadas nem alteradas. `business_opportunities` só deixa de ser lida.
- Geradores locais (`insights/analyze`, `contents/analyze`, `persist-result`,
  `transcription-processor`) — nenhuma edição; já rodam.
- UI (`app/page.tsx`, `app/conteudos/page.tsx`) — já aciona as rotas locais;
  nenhuma edição.
- `lib/n8n/mappers.ts` — `mapBusinessOpportunities`/`BusinessOpportunityRow`
  deixam de ser importados por `opportunities/route.ts`, mas o arquivo em si
  não é editado nesta fase (outros mappers podem seguir em uso).

## Verificação (sem framework de testes)

1. `npx tsc --noEmit` limpo (nenhuma referência pendente a `agents.ts`,
   `/api/agents/*`, ou às três chaves de webhook removidas).
2. `npx eslint` sem regressões novas.
3. `grep -rn "triggerBusiness\|triggerArticle\|triggerSocial\|/api/agents\|business_opportunities" app/ lib/ components/`
   → nenhuma referência viva fora de `mappers.ts` (definições) e do doc.
4. Smoke — `GET /api/opportunities` retorna cards de `app_opportunities` com
   `conversationTitle` preenchido (tipa e roda contra o Postgres).
5. n8n — os três workflows aparecem `active:false` na API; 01/03/07 seguem
   `active:true`.

## Erros / riscos

- **Baixo.** A troca de fonte é 1:1 e não-destrutiva; `business_opportunities`
  permanece no banco.
- Se a UI de Oportunidades esperar algum campo hoje derivado do jsonb do n8n
  que `app_opportunities` não tenha, ajustar o mapeamento — `OpportunityCard`
  já cobre os campos consumidos, então o risco é remoto.
- Desativar 02/04/05 é reversível; para religar basta `active=true`.

## Fora de escopo (YAGNI)

- Migrar histórico de `business_opportunities` para `app_opportunities`.
- Deletar (permanente) qualquer workflow no n8n.
- Refatorar `mappers.ts` para remover mappers do n8n ainda referenciados.
- Qualquer alteração em embeddings/Clone (01/03/07/Clone Andrezza/Dados Plaud).

## Segurança

- `N8N_API_KEY`/`N8N_WEBHOOK_SECRET` mascarados em qualquer saída.
- `.env`, `local.db`, `~/Redpine/meetings_access` nunca vão ao GitHub.
- Nenhuma ação destrutiva sem OK explícito do usuário; desativação é reversível.
```