# Fase 2 — UI lê as tabelas dos agentes n8n

**Data:** 2026-08-24
**Status:** aprovado
**Depende de:** Fase 1+0 (view `conversations` sobre `meetings`, driver Postgres) — concluída.

## Objetivo

Repontar as rotas de **leitura** das 3 telas da app (Oportunidades, Conteúdo,
Insights) das tabelas locais `app_*` (vazias) para as tabelas dos agentes n8n,
achatando o payload `jsonb` no shape que a UI já consome. **Sem mudança de UI e
sem mudança do contrato de resposta** — os componentes SWR continuam recebendo
`{ data: [...], total }` com os mesmos campos. A troca é interna à rota.

## Decisões de design (do brainstorming)

1. **Mapeamento 1:1:**
   - Oportunidades ← `business_opportunities`
   - Conteúdo ← `social_posts`
   - Insights ← `article_insights`
2. **Troca direta (n8n only).** As rotas passam a ler SOMENTE das tabelas n8n via
   `pool.query`. Sem flag `AI_SOURCE_*` (YAGNI — só existe um caminho agora). As
   tabelas `app_*` ficam mortas até a Fase 5.
3. **Read-only nesta fase.** O modelo n8n é gerado pelo agente e não tem campos
   editáveis (`status`/`notes`/`tags`) por item. `PATCH .../[id]` passa a retornar
   `405`. Edição de estado do usuário (overlay app-side) fica para uma fase futura.
4. **Achatamento defensivo do jsonb.** `business_opportunities` guarda um array de
   oportunidades em UMA linha (coluna `opportunities` jsonb); cada item vira 1 card.
   `social_posts` e `article_insights` são 1 linha = 1 card. Toda leitura de campo
   jsonb tem fallback seguro — campo ausente nunca quebra o mapper.
5. **id/link:** `id = item.id ?? \`${row.id}:${index}\`` (id próprio do item se
   existir, senão sintético linha:índice, estável entre recarregamentos).
   `conversationId = meeting_ids?.[0] ?? null` (liga ao 1º meeting do lote).

## Escopo

| Rota | Ação |
|------|------|
| `GET /api/opportunities` · `/contents` · `/insights` (lista) | Repontar para n8n via `pool.query` + mapper |
| `GET .../[id]` (detalhe) ×3 | Repontar para n8n (senão lista→detalhe dá 404 por ids incompatíveis) |
| `PATCH .../[id]` ×3 | Read-only: retorna `405 { error }` |
| `POST .../analyze` ×2 | **Intocado** (geração local órfã; não afeta leitura n8n) |

## Schema real das tabelas n8n (introspecção do cloud, 2026-08-24, todas com 0 linhas)

```
business_opportunities:
  id uuid, user_id text, meeting_ids text[], date_range_start date,
  date_range_end date, opportunities jsonb, raw_analysis text, created_at timestamptz

article_insights:
  id uuid, user_id text, meeting_ids text[], title text, abstract_text text,
  key_findings jsonb, methodology_notes text, references_suggested jsonb,
  full_content text, focus_area text, created_at timestamptz

social_posts:
  id uuid, user_id text, meeting_ids text[], platform text, content_type text,
  title text, body text, hashtags jsonb, image_prompt text, created_at timestamptz
```

## Componentes

### `lib/n8n/mappers.ts` (NOVO)

Três mappers **puros** (sem I/O, testáveis sem banco) + tipos de card.

Os tipos de card incluem os campos enriquecidos (`conversationTitle?`,
`conversationDate?`) além dos campos-base; o mapper deixa-os `undefined` e a rota
os preenche no passo de enriquecimento. O shape final de cada card espelha o que a
rota `app_*` correspondente retorna hoje (mesmo contrato para a UI).

**`mapBusinessOpportunities(rows): OpportunityCard[]`** — achatamento 1→N:
```ts
rows.flatMap((row) => {
  const items = Array.isArray(row.opportunities) ? row.opportunities : [];
  return items.map((it, i) => ({
    id: it.id ?? `${row.id}:${i}`,
    title: it.title ?? 'Sem título',
    pain: it.pain ?? '',
    context: it.context ?? null,
    score: Number(it.score ?? 0),
    type: it.type ?? 'produto',
    status: it.status ?? 'nova',        // n8n não traz estado; default coerente com schema app
    notes: null, tags: null,            // não editável nesta fase
    conversationId: row.meeting_ids?.[0] ?? null,
    createdAt: row.created_at,
  }));
});
```

**`mapSocialPosts(rows): ContentCard[]`** — 1 linha = 1 card:
```ts
{
  id: row.id, title: row.title ?? '', platform: row.platform ?? '',
  theme: row.content_type ?? '',       // content_type → "tema" da UI
  outline: JSON.stringify({ body: row.body ?? '', hashtags: row.hashtags ?? [], imagePrompt: row.image_prompt ?? null }),
  mentionCount: 1,
  relevanceScore: 0,                   // n8n não pontua; UI tolera 0
  status: 'sugerido', notes: null,
  conversationId: row.meeting_ids?.[0] ?? null,
  createdAt: row.created_at,
}
```

**`mapArticleInsights(rows): CrossInsightCard[]`** — 1 linha = 1 card:
```ts
{
  id: row.id, title: row.title ?? '', description: row.abstract_text ?? '',
  pattern: row.focus_area ?? '',
  insightType: row.focus_area ?? 'geral',   // focus_area → pattern E insightType
  confidence: 0, status: 'new', actionSuggestion: null,
  conversationIds: JSON.stringify(row.meeting_ids ?? []),
  createdAt: row.created_at,
}
```

**Mapeamentos inferidos (validados no brainstorming):**
- `social_posts.content_type` → `theme`; `relevanceScore` forçado a `0`.
- `article_insights.focus_area` → `pattern` **e** `insightType`; `confidence` forçado a `0`.
- `status` das oportunidades default `'nova'` (n8n não traz estado).

### Rotas de lista (`GET .../route.ts` ×3)

Fluxo (exemplo oportunidades):
```
1. SELECT b.id, b.meeting_ids, b.opportunities, b.created_at
     FROM business_opportunities b
    ORDER BY b.created_at DESC LIMIT $1
2. cards = mapBusinessOpportunities(rows)   // achata jsonb → cards (com conversationId)
3. enriquecer: coletar os conversationId distintos e não-nulos dos cards,
   um SELECT id, title, date FROM conversations WHERE id = ANY($1), montar um
   Map id→{title,date}, e preencher conversationTitle/conversationDate em cada card.
   (Enriquecimento acontece DEPOIS do mapper, pois o achatamento 1→N é em JS; a view
   conversations enxerga meetings.)
4. filtros status/type client-side (como hoje)
5. { data, total }                          // MESMO contrato
```

O mesmo padrão de enriquecimento em 2 passos vale para as 3 rotas. `social_posts` e
`article_insights` não precisam de flatten (1 linha = 1 card), mas seguem o mesmo
enriquecimento por `conversationId`.

### Rotas de detalhe (`GET .../[id]/route.ts` ×3)

- Oportunidades: id sintético `row:idx` → buscar a linha (`row.id`), indexar o array
  `opportunities[idx]`, mapear 1 card. Não encontrado → `404`.
- `social_posts`/`article_insights`: resolver por `row.id` direto. Não encontrado → `404`.
- `PATCH` → `405 { error: 'Edição desabilitada nesta fase (dados read-only do n8n)' }`.

## Erros

- Query falha / n8n indisponível → `500 { error }` (padrão atual).
- jsonb malformado (não-array onde se espera array) → mapper trata com `Array.isArray`
  → `[]`, retorna lista vazia em vez de estourar. Zero linhas é estado válido.
- `[id]` não encontrado (inclui id sintético cuja linha/índice sumiu) → `404`.

## Testes

Padrão do repo: script `tsx` executável, `node:assert/strict`, auto-limpante.

1. **Mappers puros (sem banco)** — o teste central. Alimentar cada mapper com
   payloads jsonb sintéticos: array cheio, array vazio, campo ausente,
   `opportunities` não-array. Assertar shape, ids sintéticos e defaults. Cobre o
   risco principal (formato jsonb incerto) sem depender de dados reais.
2. **Rota contra o cloud** — inserir 1 linha de teste em cada tabela n8n (jsonb
   realista), chamar o handler, assertar `{ data, total }` e o achatamento 1→N em
   oportunidades. **Remover a linha de teste ao final** (não poluir).
3. **`[id]`** — resolver id sintético `row:idx` → card certo; id inexistente → `404`.
   **`PATCH` → `405`.**
4. **Tipos:** `npx tsc --noEmit` limpo ao final de cada task.

## Fora de escopo

- Não mexe na view `conversations` nem nas 20 rotas que a usam.
- Não toca nos `POST .../analyze` (geração local; órfã até definir gatilho).
- Sem edição (overlay de estado app-side) — fase futura.
- `app_*` permanecem intocadas (mortas até a Fase 5).
- Sem flag `AI_SOURCE_*`.
