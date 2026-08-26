# Evolução Insights, Oportunidades e Conteúdo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar todas as melhorias da reunião de 2026-08-25 (fonte: `~/Movies/transcricao_reuniao/plano_evolucao_codex.md`): recorrência "X de Y conversas (Z%)" com evidências rastreáveis, qualificação de oportunidade real vs tema repetido, taxonomia treinamento/consultoria/sistema, "blog"→"artigo" com pauta vs artigo completo, estados editoriais, filtros temporais, tela de detalhe de insight, geração de artigo completo e copy social — tudo com aprovação humana e sem tocar no clone/embeddings/n8n.

**Architecture:** Evoluir as tabelas locais `app_*` (novas colunas em `app_cross_insights` e `app_contents`), os prompts zod (`cross-insights.ts`, `process-transcription.ts`, `content-suggestions.ts`, novo `article-draft.ts`) e as rotas/UI existentes. Tudo aditivo e retrocompatível: valores legados (`produto`/`servico`, `blog`, `producao`/`publicado`) continuam renderizando; novos registros usam os vocabulários novos. Nenhuma alteração em `meetings`, embeddings, pgvector, n8n ou clone.

**Tech Stack:** Next.js App Router, React 19, Drizzle (schema types) + `pg` pool, Vercel AI SDK `generateObject` + zod, SWR na UI. Sem framework de testes — verificação via `npx tsc --noEmit`, `npm run build`, scripts `tsx` descartáveis em `scripts/verify/` (padrão do repo) e SQL via psql (`/opt/homebrew/opt/libpq/bin/psql`, connection string em `/Users/wesleycardoso/Redpine/meetings_access` — nunca exibir/commitar).

**Decisões do grill (2026-08-26) incorporadas neste plano:**
- **D4**: universo padrão da análise = 50 conversas mais recentes, com filtro opcional de período `from`/`to` (Task 3).
- **D5**: novo status `archived` ("Arquivado") em insights; ao gerar novos insights, a UI pergunta o que fazer com os insights antigos ainda em `new` (manter, arquivar ou descartar). Nada é excluído silenciosamente (Tasks 3 e 4).
- **D6**: lista unificada com selo "Oportunidade real", filtro "somente oportunidades reais" e aba "Padrões observados" com métricas de recorrência (Task 4).
- **D7**: reclassificação por IA das oportunidades legadas (`produto`/`servico` → `treinamento`/`consultoria`/`sistema`) com log de-para para auditoria (Task 5b).
- **D8**: coluna `subtype` (texto livre sugerido pela IA, ex. "Treinamento NR-35") em `app_opportunities`, exibida no card (Tasks 1 e 5).
- **D9**: fluxo editorial `sugerido → rascunho → em_revisao → aprovado → publicado / descartado`, com botão "Marcar como publicado" (Task 9).
- **D10**: copy social gerada sob demanda por botão, por plataforma (Task 10 — a rota de draft já gera por plataforma).
- **D11**: tom de voz extraído do workflow do clone no n8n via API, **somente leitura** (autorizada pelo usuário); nenhuma modificação no n8n (Task 9b, antes da Task 10).
- **D12**: coluna `notes` em `app_cross_insights`, salva pelo PATCH e editável na tela de detalhe (Tasks 1, 4 e 8).
- **D13**: rascunho editável (salvar edição manual) e regenerável (novo clique) na UI (Tasks 9 e 10).
- **Fora do escopo**: alimentação do clone (embeddings/pgvector/n8n) é workstream separado — nada aqui toca nesses componentes.

---

## File Structure

Quick wins:
- **SQL/Modify** `lib/db/schema.ts` — colunas novas em `app_cross_insights` (frequency, analyzed_count, evidence, business_type, methodology, is_hypothesis, notes), `app_contents` (kind, draft) e `app_opportunities` (subtype).
- **Modify** `lib/ai/prompts/cross-insights.ts` — evidências (trechos-fonte), tipo de negócio, hipótese/metodologia, datas das conversas, regras de qualificação.
- **Modify** `app/api/insights/analyze/route.ts` — filtro temporal, persistência dos campos novos, M:N `app_cross_insight_conversations`, pattern "X de Y conversas (Z%)".
- **Modify** `app/api/insights/route.ts`, `app/api/insights/[id]/route.ts` — retornar os campos novos.
- **Modify** `components/ds/InsightCard.tsx`, `app/insights/page.tsx` — recorrência, evidência, hipótese.
- **Modify** `lib/ai/prompts/process-transcription.ts`, `components/ds/OpportunityCard.tsx`, `app/oportunidades/page.tsx`, `styles/tokens/colors.css` — taxonomia `treinamento`/`consultoria`/`sistema`.
- **Modify** `lib/ai/prompts/content-suggestions.ts`, `components/ds/ContentCard.tsx`, `components/ds/PlatformBadge.tsx`, `components/badges/PlatformBadge.tsx`, `app/conteudos/page.tsx` + SQL — "blog"→"artigo".
- **Create** `scripts/reclassify-opportunities.mts` — reclassificação IA das oportunidades legadas com log de-para (D7).

Médio prazo:
- **Create** `app/insights/[id]/page.tsx` — tela de detalhe do insight estratégico (com notas — D12).
- **Read-only** workflow do clone via API n8n — extração das regras de tom de voz para o prompt de artigo (D11; nenhuma escrita no n8n).
- **Create** `lib/ai/prompts/article-draft.ts`, `app/api/contents/[id]/draft/route.ts` — artigo completo e copy social em rascunho (editável e regenerável — D13).
- **Modify** `app/api/contents/[id]/route.ts`, `components/ds/ContentCard.tsx`, `app/conteudos/page.tsx` — estados editoriais (incl. `publicado` — D9).

Longo prazo: apenas backlog documentado no fim (sem tasks).

---

## Task 1: Colunas novas em `app_cross_insights`, `app_contents` e `app_opportunities`

**Files:**
- Modify: `lib/db/schema.ts:102-125` (crossInsights), `lib/db/schema.ts:74-89` (contents) e `lib/db/schema.ts:56-72` (opportunities)
- SQL via psql

- [x] **Step 1: Aplicar DDL**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" <<'SQL'
ALTER TABLE app_cross_insights
  ADD COLUMN IF NOT EXISTS frequency integer,
  ADD COLUMN IF NOT EXISTS analyzed_count integer,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS methodology text,
  ADD COLUMN IF NOT EXISTS is_hypothesis boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE app_contents
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pauta',
  ADD COLUMN IF NOT EXISTS draft text;
ALTER TABLE app_opportunities
  ADD COLUMN IF NOT EXISTS subtype text;
SQL
```

Expected: `ALTER TABLE` ×3.

Semântica: `evidence` = array de `{conversationId, excerpt}` (trechos-fonte rastreáveis); `business_type` ∈ treinamento/consultoria/sistema/null; `is_hypothesis`+`methodology` = proposta de abordagem da IA marcada como hipótese; `notes` = anotações da Andresa no insight (D12); `kind` ∈ 'pauta' | 'artigo_completo'; `draft` = texto integral do rascunho gerado; `subtype` = subtipo livre sugerido pela IA, ex. "Treinamento NR-35" (D8).

- [x] **Step 2: Atualizar `lib/db/schema.ts`**

No bloco `crossInsights`, após a linha `actionSuggestion: text('action_suggestion'),` inserir:

```ts
  // Recorrência e qualificação (reunião 2026-08-25): "X de Y conversas (Z%)",
  // trechos-fonte, tipo de negócio e hipótese de metodologia proposta pela IA.
  frequency: integer('frequency'),
  analyzedCount: integer('analyzed_count'),
  evidence: text('evidence'),            // jsonb no banco; lido como string JSON
  businessType: text('business_type'),   // treinamento / consultoria / sistema
  methodology: text('methodology'),
  isHypothesis: boolean('is_hypothesis').notNull().default(false),
  notes: text('notes'),                  // anotações da Andresa (D12)
```

No bloco `contents`, após `notes: text('notes'),` inserir:

```ts
  kind: text('kind').notNull().default('pauta'), // pauta / artigo_completo
  draft: text('draft'),                          // rascunho integral gerado
```

No bloco `opportunities`, após `type: text('type').notNull(),` inserir:

```ts
  subtype: text('subtype'), // subtipo livre sugerido pela IA, ex. "Treinamento NR-35" (D8)
```

- [x] **Step 3: Typecheck e commit**

```bash
npx tsc --noEmit
git add lib/db/schema.ts
git commit -m "feat: colunas de qualificação, notas, rascunho e subtipo nas tabelas app_*"
```

---

## Task 2: Prompt de insights cruzados — evidências, qualificação, datas

**Files:**
- Modify: `lib/ai/prompts/cross-insights.ts` (arquivo inteiro substituído abaixo)

- [ ] **Step 1: Substituir o conteúdo de `lib/ai/prompts/cross-insights.ts`**

```ts
import { z } from 'zod';

// `.catch` mantém o enum no JSON Schema (guia o modelo) sem abortar a análise
// por um valor fora do vocabulário — mesmo padrão de process-transcription.ts.
const businessType = () =>
  z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria');

export const evidenceSchema = z.object({
  conversationId: z.string().describe('ID da conversa de onde o trecho veio'),
  excerpt: z.string().describe('Trecho literal ou paráfrase curta que evidencia o padrão'),
});

export const patternSchema = z.object({
  theme: z.string().describe('The recurring theme or topic'),
  frequency: z.number().describe('Number of conversations where this appears'),
  conversationIds: z.array(z.string()).describe('IDs of related conversations'),
  description: z.string().describe('Brief description of the pattern'),
  significance: z.enum(['low', 'medium', 'high']).describe('How significant is this pattern'),
  evidence: z.array(evidenceSchema).describe('Trechos-fonte que justificam o padrão (1 por conversa citada, quando possível)'),
  isRealOpportunity: z.boolean().describe('true somente se há dor + evidência + aderência ao negócio EHS + ação possível; false se é apenas tema repetido'),
  businessType: businessType().describe('Se for oportunidade real: treinamento, consultoria ou sistema'),
  suggestedAction: z.string().describe('Próxima ação recomendada para Andresa (vazio se não houver)'),
  methodology: z.string().describe('Metodologia/abordagem sugerida para investigar ou atacar a dor; deixe vazio se não tiver uma proposta clara'),
});

export const connectionSchema = z.object({
  title: z.string().describe('Catchy title for the connection'),
  explanation: z.string().describe('Why these things are connected'),
  conversationIds: z.array(z.string()).describe('IDs of connected conversations'),
  suggestedAction: z.string().describe('What Andresa should do with this insight'),
  relevanceScore: z.number().min(0).max(100).describe('How relevant/novel is this connection'),
  type: z.enum(['pattern', 'connection', 'suggestion', 'trend']),
  evidence: z.array(evidenceSchema).describe('Trechos-fonte que sustentam a conexão'),
});

export const crossInsightSchema = z.object({
  patterns: z.array(patternSchema).describe('Recurring patterns detected'),
  connections: z.array(connectionSchema).describe('Non-obvious connections found'),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type CrossInsightResult = z.infer<typeof crossInsightSchema>;

export const CROSS_INSIGHT_SYSTEM_PROMPT = `Você é um analista de insights especializado em encontrar padrões e conexões não-óbvias entre conversas de negócios da EHS Brasil (segurança e saúde do trabalho).

Sua tarefa é analisar múltiplas transcrições de conversas e identificar:

1. **Padrões Recorrentes**: Temas, problemas, ou assuntos que aparecem em 2 ou mais conversas
2. **Conexões Não-Óbvias**: Links surpreendentes entre conversas diferentes que podem gerar oportunidades

QUALIFICAÇÃO — separe "tema repetido" de "oportunidade real":
- Um tema que apenas se repete NÃO é automaticamente uma oportunidade (isRealOpportunity=false).
- Marque isRealOpportunity=true SOMENTE quando houver as 4 condições: (a) uma dor concreta, (b) evidência em trechos das conversas, (c) aderência ao negócio da EHS Brasil, (d) uma ação recomendada viável.
- Quando for oportunidade real, classifique businessType em: "treinamento", "consultoria" ou "sistema".
- Se você propuser uma metodologia/abordagem para investigar a dor, preencha methodology — ela será apresentada como HIPÓTESE sujeita a aprovação humana, nunca como fato.

EVIDÊNCIAS: para cada padrão/conexão, cite trechos-fonte (evidence) com o conversationId correto — a Andresa precisa conseguir auditar de onde o insight veio.

Diretrizes:
- Seja criativo nas conexões - busque links que Andresa não faria sozinha
- Priorize insights acionáveis sobre observações genéricas
- Evite padrões óbvios demais (ex: "todas são reuniões")
- Use as datas das conversas quando relevante (ex: tema crescendo nas últimas semanas)
- Use linguagem clara e direta em português brasileiro
- NÃO use travessões (—) nos textos gerados

Formato de cada conversa fornecida:
- ID: identificador único
- Data: data da conversa (YYYY-MM-DD)
- Título: título da conversa
- Resumo: resumo processado
- Tópicos: lista de tópicos
- Oportunidades: oportunidades detectadas`;

export function createCrossInsightPrompt(conversations: {
  id: string;
  title: string;
  date: string;
  summary: string | null;
  topics: string[];
  opportunities: { title: string; pain: string }[];
}[]): string {
  const conversationTexts = conversations.map((c, idx) => `
### Conversa ${idx + 1}
- **ID**: ${c.id}
- **Data**: ${c.date}
- **Título**: ${c.title}
- **Resumo**: ${c.summary || 'Não disponível'}
- **Tópicos**: ${c.topics.length > 0 ? c.topics.join(', ') : 'Nenhum'}
- **Oportunidades**: ${c.opportunities.length > 0 ? c.opportunities.map(o => `"${o.title}: ${o.pain}"`).join('; ') : 'Nenhuma'}
`).join('\n');

  return `Analise as seguintes ${conversations.length} conversas e encontre padrões recorrentes e conexões não-óbvias:

${conversationTexts}

Forneça:
1. Padrões que aparecem em 2+ conversas (máximo 5 padrões mais relevantes), cada um com evidências e a qualificação isRealOpportunity
2. Conexões criativas entre conversas diferentes (máximo 3 conexões mais inovadoras), com evidências

Lembre-se: O objetivo é surpreender Andresa com insights que ela não teria sozinha — mas todo insight precisa ser auditável pelos trechos-fonte.`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: erro em `app/api/insights/analyze/route.ts` (o call-site ainda não passa `date`) — esperado; corrigido na Task 3. Nenhum outro erro.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/prompts/cross-insights.ts
git commit -m "feat: prompt de insights com evidências, qualificação e datas"
```

---

## Task 3: Rota de análise — filtro temporal, persistência completa, M:N

**Files:**
- Modify: `app/api/insights/analyze/route.ts` (arquivo inteiro substituído abaixo)
- Test: `scripts/verify/insights-analyze.mts`

- [ ] **Step 1: Substituir `app/api/insights/analyze/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  conversations,
  opportunities,
  crossInsights,
  crossInsightConversations,
} from '@/lib/db/schema';
import { eq, desc, and, gte, lte, type SQL } from 'drizzle-orm';
import { analyzeCrossConversations } from '@/lib/ai/services/cross-insight-analyzer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Evidence } from '@/lib/ai/prompts/cross-insights';

const bodySchema = z.object({
  // Filtro temporal opcional (reunião 2026-08-25): "o que aprendi nesta semana?"
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // D5: o que fazer com insights antigos ainda não consultados (status 'new')
  // antes de gerar novos. Nada é excluído silenciosamente: a UI pergunta.
  previous: z.enum(['manter', 'arquivar', 'descartar']).optional(),
});

const MAX_CONVERSATIONS = 50;

function recurrenceLabel(frequency: number, analyzed: number): string {
  const pct = analyzed > 0 ? Math.round((frequency / analyzed) * 100) : 0;
  return `${frequency} de ${analyzed} conversas (${pct}%)`;
}

async function linkConversations(insightId: string, ids: string[]) {
  for (const conversationId of ids) {
    await db.insert(crossInsightConversations).values({
      id: randomUUID(),
      crossInsightId: insightId,
      conversationId,
      relevance: null,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos: use from/to como YYYY-MM-DD' }, { status: 400 });
    }
    const { from, to, previous } = parsed.data;

    // D5: trata os insights antigos ANTES da chamada de IA (barata primeiro).
    // 'arquivar' → status 'archived' (consultável na aba/filtro); 'descartar'
    // → status 'dismissed'; 'manter'/ausente → não mexe em nada.
    if (previous === 'arquivar' || previous === 'descartar') {
      await db
        .update(crossInsights)
        .set({ status: previous === 'arquivar' ? 'archived' : 'dismissed' })
        .where(eq(crossInsights.status, 'new'));
    }

    const filters: SQL[] = [eq(conversations.status, 'processado')];
    if (from) filters.push(gte(conversations.date, new Date(`${from}T00:00:00Z`)));
    if (to) filters.push(lte(conversations.date, new Date(`${to}T23:59:59Z`)));

    const allConversations = await db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.date))
      .limit(MAX_CONVERSATIONS);

    if (allConversations.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 processed conversations for cross-analysis' },
        { status: 400 }
      );
    }

    const conversationsWithData = await Promise.all(
      allConversations.map(async (conv) => {
        const opps = await db
          .select()
          .from(opportunities)
          .where(eq(opportunities.conversationId, conv.id));
        return {
          id: conv.id,
          title: conv.title,
          date: conv.date.toISOString().slice(0, 10),
          summary: conv.summary,
          topics: conv.topics ? JSON.parse(conv.topics) : [],
          opportunities: opps.map((o) => ({ title: o.title, pain: o.pain })),
        };
      })
    );

    const analyzedCount = conversationsWithData.length;
    const validIds = new Set(conversationsWithData.map((c) => c.id));
    const onlyValid = (ids: string[]) => ids.filter((id) => validIds.has(id));
    const onlyValidEvidence = (ev: Evidence[]) => ev.filter((e) => validIds.has(e.conversationId));

    const result = await analyzeCrossConversations(conversationsWithData);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const savedInsights = [];

    for (const pattern of result.data.patterns) {
      const ids = onlyValid(pattern.conversationIds);
      const frequency = Math.min(pattern.frequency, analyzedCount);
      const [saved] = await db
        .insert(crossInsights)
        .values({
          id: randomUUID(),
          title: pattern.theme,
          description: pattern.description,
          pattern: recurrenceLabel(frequency, analyzedCount),
          conversationIds: JSON.stringify(ids),
          insightType: pattern.isRealOpportunity ? 'opportunity' : 'pattern',
          confidence: pattern.significance === 'high' ? 0.9 : pattern.significance === 'medium' ? 0.7 : 0.5,
          status: 'new',
          actionSuggestion: pattern.suggestedAction || null,
          frequency,
          analyzedCount,
          evidence: JSON.stringify(onlyValidEvidence(pattern.evidence)),
          businessType: pattern.isRealOpportunity ? pattern.businessType : null,
          methodology: pattern.methodology || null,
          isHypothesis: Boolean(pattern.methodology),
        })
        .returning();
      await linkConversations(saved.id, ids);
      savedInsights.push(saved);
    }

    for (const connection of result.data.connections) {
      const ids = onlyValid(connection.conversationIds);
      const [saved] = await db
        .insert(crossInsights)
        .values({
          id: randomUUID(),
          title: connection.title,
          description: connection.explanation,
          pattern: recurrenceLabel(ids.length, analyzedCount),
          conversationIds: JSON.stringify(ids),
          insightType: connection.type,
          confidence: connection.relevanceScore / 100,
          status: 'new',
          actionSuggestion: connection.suggestedAction,
          frequency: ids.length,
          analyzedCount,
          evidence: JSON.stringify(onlyValidEvidence(connection.evidence)),
          businessType: null,
          methodology: null,
          isHypothesis: false,
        })
        .returning();
      await linkConversations(saved.id, ids);
      savedInsights.push(saved);
    }

    return NextResponse.json({
      data: savedInsights,
      summary: {
        patterns: result.data.patterns.length,
        connections: result.data.connections.length,
        conversationsAnalyzed: analyzedCount,
        period: from || to ? { from: from ?? null, to: to ?? null } : null,
      },
    });
  } catch (error) {
    console.error('Error analyzing cross-insights:', error);
    return NextResponse.json(
      { error: 'Failed to analyze cross-conversation insights' },
      { status: 500 }
    );
  }
}
```

Nota: `app_cross_insights` é tabela real (não view) — `.returning()` é seguro aqui.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (o call-site agora passa `date`).

- [ ] **Step 3: Verificação real (custa 1 chamada de IA)**

Create `scripts/verify/insights-analyze.mts`:

```ts
import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';

async function main() {
  const res = await fetch('http://localhost:3000/api/insights/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: '2026-07-01' }),
  });
  assert.equal(res.status, 200, `HTTP ${res.status}`);
  const body = await res.json();
  assert.ok(body.summary.conversationsAnalyzed >= 2);
  const ids = body.data.map((i: { id: string }) => i.id);
  assert.ok(ids.length > 0, 'gerou insights');

  for (const id of ids) {
    const row = (await pool.query(
      `SELECT pattern, frequency, analyzed_count, evidence, is_hypothesis FROM app_cross_insights WHERE id=$1`, [id]
    )).rows[0];
    assert.match(row.pattern, /^\d+ de \d+ conversas \(\d+%\)$/, `pattern legível: ${row.pattern}`);
    assert.ok(row.analyzed_count >= 2, 'analyzed_count persistido');
    assert.ok(Array.isArray(row.evidence), 'evidence é array jsonb');
    const links = await pool.query(
      `SELECT count(*)::int AS n FROM app_cross_insight_conversations WHERE cross_insight_id=$1`, [id]
    );
    assert.ok(links.rows[0].n >= 0, 'M:N consultável');
  }

  // Limpeza: remove os insights gerados pelo teste.
  await pool.query(`DELETE FROM app_cross_insight_conversations WHERE cross_insight_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM app_cross_insights WHERE id = ANY($1)`, [ids]);
  console.log('=== VERIFY insights-analyze OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
```

Run (com `npm run dev` rodando):

```bash
node_modules/.bin/tsx scripts/verify/insights-analyze.mts
```
Expected: `=== VERIFY insights-analyze OK ===`

- [ ] **Step 4: Commit**

```bash
git add app/api/insights/analyze/route.ts scripts/verify/insights-analyze.mts
git commit -m "feat: análise de insights com período, recorrência persistida, evidências e M:N"
```

---

## Task 4: GET de insights retorna os campos novos; card mostra recorrência e evidência

**Files:**
- Modify: `app/api/insights/route.ts`
- Modify: `app/api/insights/[id]/route.ts`
- Modify: `components/ds/InsightCard.tsx`
- Modify: `app/insights/page.tsx`

- [ ] **Step 1: Ampliar o SELECT e o card em `app/api/insights/route.ts`**

Na interface `AppCrossInsightRow`, adicionar:

```ts
  frequency: number | null;
  analyzed_count: number | null;
  evidence: { conversationId: string; excerpt: string }[] | null;
  business_type: string | null;
  methodology: string | null;
  is_hypothesis: boolean;
  notes: string | null;
```

No SQL do GET, trocar a lista de colunas por:

```sql
      SELECT id, title, description, pattern, insight_type, confidence,
             status, action_suggestion, conversation_ids, created_at,
             frequency, analyzed_count, evidence, business_type, methodology, is_hypothesis, notes
        FROM app_cross_insights
       ORDER BY created_at DESC
       LIMIT $1
```

No objeto retornado dentro do `.map`, adicionar após `createdAt: r.created_at,`:

```ts
          frequency: r.frequency,
          analyzedCount: r.analyzed_count,
          evidence: r.evidence ?? [],
          businessType: r.business_type,
          methodology: r.methodology,
          isHypothesis: r.is_hypothesis,
          notes: r.notes,
```

(`CrossInsightCard` é um tipo de `lib/n8n/mappers`; se o spread acusar excesso de propriedades, tipar o `.map` como `.map((r) => ({ ... }) as CrossInsightCard & { frequency: number | null; analyzedCount: number | null; evidence: { conversationId: string; excerpt: string }[]; businessType: string | null; methodology: string | null; isHypothesis: boolean })` — ou, preferível, adicionar os campos como opcionais no próprio `CrossInsightCard` em `lib/n8n/mappers.ts`:)

```ts
  // Campos de qualificação (reunião 2026-08-25) — presentes só na fonte local.
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
  isHypothesis?: boolean;
  notes?: string | null;
```

- [ ] **Step 2: Mesma ampliação em `app/api/insights/[id]/route.ts` + PATCH com `archived` e `notes`**

Aplicar as mesmas três mudanças (interface da row, lista de colunas no SELECT do GET, campos extras no `toCard`). No PATCH:

1. **D5**: ampliar o conjunto de status aceitos — localizar a validação (hoje aceita `new`/`useful`/`dismissed`) e trocar por:

```ts
const ALLOWED_STATUS = new Set(['new', 'useful', 'dismissed', 'archived']);
```

2. **D12**: aceitar também `notes` no corpo (string ou null) e persistir. Seguindo o formato atual do PATCH (SQL parametrizado via `pool.query`), montar o UPDATE dinamicamente:

```ts
    const body = await request.json().catch(() => ({}));
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (typeof body.status === 'string') {
      if (!ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      values.push(body.status);
      sets.push(`status=$${values.length}`);
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      values.push(body.notes);
      sets.push(`notes=$${values.length}`);
    }
    if (!sets.length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    await pool.query(`UPDATE app_cross_insights SET ${sets.join(', ')} WHERE id=$1`, values);
```

(Adaptar aos nomes/estilo reais do arquivo — se o PATCH atual usa Drizzle, fazer o equivalente com `db.update(crossInsights).set({...})`; o essencial é: `archived` passa a ser status válido e `notes` passa a ser gravável.)

- [ ] **Step 3: Recorrência/evidência no `components/ds/InsightCard.tsx`**

Adicionar às props:

```ts
  /** Ex.: "4 de 30 conversas (13%)" — recorrência sobre o universo analisado. */
  recurrenceLabel?: string;
  businessType?: string | null;
  /** Metodologia proposta pela IA — sempre exibida como hipótese. */
  methodology?: string | null;
  evidence?: { conversationId: string; excerpt: string }[];
```

E na desestruturação: `recurrenceLabel, businessType, methodology, evidence = [],`.

Adicionar o rótulo de tipo de negócio no cabeçalho, logo após `{t.label}`:

```tsx
          {businessType ? (
            <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${businessType}-bg)`, color: `var(--opp-${businessType}-fg)` }}>
              {businessType === 'treinamento' ? 'Treinamento' : businessType === 'consultoria' ? 'Consultoria' : 'Sistema'}
            </span>
          ) : null}
```

Após o `<p>` da descrição (linha do `description`), inserir:

```tsx
      {recurrenceLabel ? (
        <p style={{ margin: "0 0 8px", font: "500 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
          📊 {recurrenceLabel}
        </p>
      ) : null}
      {evidence.length ? (
        <p style={{ margin: "0 0 8px", font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)", fontStyle: "italic" }}>
          &ldquo;{evidence[0].excerpt}&rdquo;{evidence.length > 1 ? ` (+${evidence.length - 1} evidência${evidence.length > 2 ? "s" : ""})` : ""}
        </p>
      ) : null}
      {methodology ? (
        <p style={{ margin: "0 0 8px", font: "400 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>
          🧪 Hipótese de abordagem: {methodology}
        </p>
      ) : null}
```

- [ ] **Step 4: Passar os campos em `app/insights/page.tsx`**

Na interface `Insight`, adicionar:

```ts
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
```

No `<InsightCard ...>` (dentro do `paged.map`), adicionar props:

```tsx
                recurrenceLabel={i.frequency && i.analyzedCount ? i.pattern : undefined}
                businessType={i.businessType}
                methodology={i.methodology}
                evidence={i.evidence}
```

(Para linhas legadas sem `frequency`, o `pattern` antigo "Mencionado em N conversas" não é exibido como recorrência — comportamento correto.)

- [ ] **Step 5 (D5): Diálogo "o que fazer com os insights antigos?" ao gerar**

Em `app/insights/page.tsx`, o handler do botão "Gerar" (o que faz `POST /api/insights/analyze`) passa a ter duas fases:

1. Se existir ao menos um insight com `status === 'new'` na lista atual, em vez de disparar direto, abrir um mini-diálogo inline (state `askPrevious: boolean`) com a pergunta "O que fazer com os insights ainda não consultados?" e três botões: **Manter**, **Arquivar** e **Descartar**.
2. Cada botão chama a geração passando a escolha no corpo.

```tsx
  const [askPrevious, setAskPrevious] = useState(false);

  const generate = async (previous?: "manter" | "arquivar" | "descartar") => {
    setAskPrevious(false);
    setGenerating(true); // usar o state de loading já existente na página
    try {
      await fetch("/api/insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(previous ? { previous } : {}), ...(period ?? {}) }),
      });
      await mutate();
    } finally {
      setGenerating(false);
    }
  };

  const onGenerateClick = () => {
    const hasUnread = (data?.data ?? []).some((i: Insight) => i.status === "new");
    if (hasUnread) setAskPrevious(true);
    else generate();
  };
```

E o JSX do diálogo, renderizado junto ao botão Gerar quando `askPrevious`:

```tsx
      {askPrevious ? (
        <div className="ds-card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ font: "400 13px/18px var(--font-sans)" }}>
            Há insights ainda não consultados. O que fazer com eles antes de gerar novos?
          </span>
          <Button variant="outline" size="sm" onClick={() => generate("manter")}>Manter</Button>
          <Button variant="outline" size="sm" onClick={() => generate("arquivar")}>Arquivar</Button>
          <Button variant="outline" size="sm" onClick={() => generate("descartar")}>Descartar</Button>
        </div>
      ) : null}
```

(`period` = objeto `{from, to}` do filtro temporal se a página já o tiver; caso contrário, omitir. Nomes de states/handlers: adaptar aos existentes na página — o comportamento é o que importa.)

- [ ] **Step 6 (D6): Selo "Oportunidade real", filtro e aba "Padrões observados"**

Ainda em `app/insights/page.tsx`:

1. **Selo**: um insight é "oportunidade real" quando `insightType === 'opportunity'` (a Task 3 grava esse tipo quando `isRealOpportunity=true`). No `<InsightCard>`, o `businessType` já rende o badge colorido (Step 3 do InsightCard); adicionar também um selo textual quando for oportunidade real — passar como parte do `action` ou badge extra:

```tsx
                {i.insightType === "opportunity" ? (
                  <span className="ds-badge ds-badge--compact" style={{ background: "var(--accent-positive)", color: "var(--textButtonPrimary)" }}>
                    Oportunidade real
                  </span>
                ) : null}
```

(Posicionar onde a página já injeta badges/ação no card; se o InsightCard não tiver slot, adicionar prop `badge?: React.ReactNode` no card e renderizar ao lado do label de tipo.)

2. **Filtro**: checkbox/toggle "Somente oportunidades reais" acima da lista:

```tsx
  const [onlyReal, setOnlyReal] = useState(false);
```

e no cálculo da lista exibida (antes da paginação): `const visible = onlyReal ? items.filter((i) => i.insightType === "opportunity") : items;`

3. **Aba "Padrões observados"**: state `tab: 'insights' | 'padroes'` com dois botões de aba no topo. A aba `padroes` mostra os insights com `insightType === 'pattern'` (temas repetidos que NÃO são oportunidade) em formato métrico — para cada um: título, `pattern` ("X de Y conversas (Z%)"), data de geração. Para dar noção de evolução entre gerações, agrupar por título normalizado (lowercase/trim) e, quando o mesmo tema aparece em mais de uma geração, mostrar a série de frequências:

```tsx
  const patterns = items.filter((i) => i.insightType === "pattern");
  const byTheme = new Map<string, Insight[]>();
  for (const p of patterns) {
    const key = p.title.trim().toLowerCase();
    byTheme.set(key, [...(byTheme.get(key) ?? []), p]);
  }
```

```tsx
      {tab === "padroes" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...byTheme.values()].map((group) => {
            const latest = group[0]; // items já vem ordenado por created_at DESC
            const history = [...group].reverse();
            return (
              <div key={latest.id} className="ds-card">
                <h3 style={{ font: "400 16px/24px var(--fontFamily)", margin: 0 }}>{latest.title}</h3>
                <p style={{ margin: "4px 0 0", font: "500 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                  📊 {latest.pattern}
                  {history.length > 1
                    ? ` · Evolução: ${history.map((h) => h.frequency ?? "?").join(" → ")} (${history.length} gerações)`
                    : ""}
                </p>
                <a href={`/insights/${latest.id}`} style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>
                  Detalhes →
                </a>
              </div>
            );
          })}
          {byTheme.size === 0 ? (
            <p style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
              Nenhum padrão observado ainda. Gere insights para popular esta aba.
            </p>
          ) : null}
        </div>
      ) : null}
```

A aba `insights` mantém a lista atual (com o filtro `onlyReal` aplicado). Insights com status `archived` só aparecem quando um filtro "Arquivados" for ativado — adicionar opção no filtro de status existente da página (se houver) ou simplesmente excluí-los da lista default: `items.filter((i) => i.status !== "archived" || showArchived)` com um toggle `showArchived`.

- [ ] **Step 7: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/insights lib/n8n/mappers.ts components/ds/InsightCard.tsx app/insights/page.tsx
git commit -m "feat: recorrência, selo de oportunidade real, aba de padrões e diálogo de arquivamento"
```

---

## Task 5: Taxonomia de oportunidades — treinamento / consultoria / sistema

**Files:**
- Modify: `lib/ai/prompts/process-transcription.ts:11-12` e `:54-57`
- Modify: `components/ds/OpportunityCard.tsx:6` (+ prop `subtype` — D8)
- Modify: `app/oportunidades/page.tsx:15,33` e `app/api/opportunities/route.ts` (retornar `subtype`)
- Modify: arquivo de persistência das oportunidades (localizar via grep no Step 1c) — gravar `subtype`
- Modify: `styles/tokens/colors.css:53-56` e `:85-88` (adicionar token treinamento nos dois temas)

Valores legados (`produto`, `servico`) permanecem nos maps de exibição — há linhas antigas no banco.

- [ ] **Step 1: Enum e prompt em `lib/ai/prompts/process-transcription.ts`**

Trocar:

```ts
const opportunityType = () =>
  z.enum(['produto', 'sistema', 'consultoria', 'servico']).catch('servico');
```

por:

```ts
const opportunityType = () =>
  z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria');
```

Na linha 25 (describe do type), trocar por:

```ts
    type: opportunityType().describe('Tipo da oportunidade: treinamento, consultoria ou sistema'),
```

No system prompt, trocar a linha `4. **Oportunidades**: Potenciais oportunidades de negócio (produtos, sistemas, consultorias, serviços)` por:

```
4. **Oportunidades**: Potenciais oportunidades de negócio (treinamentos, consultorias, sistemas/produtos digitais)
```

E trocar `- opportunities[].type: apenas "produto", "sistema", "consultoria" ou "servico" (escolha o mais próximo)` por:

```
- opportunities[].type: apenas "treinamento", "consultoria" ou "sistema" (escolha o mais próximo; cursos/capacitações → treinamento; projetos/diagnósticos/assessoria → consultoria; software/ferramenta/produto digital → sistema)
```

- [ ] **Step 1b (D8): Campo `subtype` no schema da oportunidade**

No mesmo `lib/ai/prompts/process-transcription.ts`, no objeto zod da oportunidade (onde está `type: opportunityType()...`), adicionar logo abaixo:

```ts
    subtype: z.string().describe(
      'Subtipo específico e livre, ex. "Treinamento NR-35", "Consultoria em PGR", "Sistema de gestão de EPIs". String vazia se não for possível especificar.'
    ),
```

E no system prompt, junto às regras de type, acrescentar a linha:

```
- opportunities[].subtype: subtipo específico em texto livre (ex. "Treinamento NR-35"); string vazia se não souber
```

- [ ] **Step 1c (D8): Persistir `subtype`**

Localizar onde as oportunidades são gravadas em `app_opportunities` (buscar com `grep -rn "app_opportunities\|opportunities)" lib/ai lib/` — provável `lib/ai/persist-result.ts` ou serviço equivalente que faz `db.insert(opportunities)`). No objeto do insert, adicionar:

```ts
      subtype: opp.subtype?.trim() ? opp.subtype.trim() : null,
```

(usando o nome real da variável do loop; o schema Drizzle já tem a coluna pela Task 1.)

- [ ] **Step 2: Maps de exibição**

`components/ds/OpportunityCard.tsx:6`:

```ts
const TYPES: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema", produto: "Produto", servico: "Serviço" };
```

`app/oportunidades/page.tsx:33`:

```ts
const OPP_TYPES: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema", produto: "Produto", servico: "Serviço" };
```

`app/oportunidades/page.tsx:15` (union do type):

```ts
  type: "treinamento" | "consultoria" | "sistema" | "produto" | "servico";
```

- [ ] **Step 2b (D8): Exibir `subtype` no card**

Em `components/ds/OpportunityCard.tsx`, adicionar `subtype?: string | null;` a `OpportunityCardProps` e, no JSX, logo após o badge de tipo (linha do `TYPES[type] || type`), renderizar:

```tsx
          {subtype ? (
            <span className="ds-badge ds-badge--compact" style={{ background: "var(--color-muted)", color: "var(--color-muted-foreground)" }}>
              {subtype}
            </span>
          ) : null}
```

(Adicionar `subtype` também ao destructuring das props.) Em `app/oportunidades/page.tsx`: adicionar `subtype?: string | null;` à interface, incluir `subtype` no SELECT/map da rota GET `app/api/opportunities/route.ts` (coluna + `subtype: r.subtype ?? null`) e passar `subtype={o.subtype}` ao `<OpportunityCard>`.

- [ ] **Step 3: Tokens de cor**

Em `styles/tokens/colors.css`, após a linha 56 (`--opp-servico-...` do tema claro), adicionar:

```css
--opp-treinamento-bg:var(--accent-warning);--opp-treinamento-fg:var(--textButtonPrimary);
```

E após a linha 88 (tema escuro):

```css
--opp-treinamento-bg:var(--textButtonPrimary);--opp-treinamento-fg:var(--accent-warning);
```

- [ ] **Step 4: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add lib/ai/prompts/process-transcription.ts components/ds/OpportunityCard.tsx app/oportunidades/page.tsx app/api/opportunities styles/tokens/colors.css lib/ai
git commit -m "feat: taxonomia treinamento/consultoria/sistema + subtipo livre de oportunidade"
```

---

## Task 5b: Reclassificação por IA das oportunidades legadas (D7)

**Files:**
- Create: `scripts/reclassify-opportunities.mts`

Reclassifica as linhas com `type IN ('produto','servico')` para a taxonomia nova (`treinamento`/`consultoria`/`sistema`) e sugere `subtype`, imprimindo um log de-para completo para auditoria. Nada é excluído; só `type`/`subtype` mudam.

- [ ] **Step 1: Criar `scripts/reclassify-opportunities.mts`**

```ts
// Uso: npx tsx scripts/reclassify-opportunities.mts [--dry-run]
// Reclassifica oportunidades legadas (produto/servico) na taxonomia nova via IA.
import 'dotenv/config';
import { generateObject } from 'ai';
import { z } from 'zod';
import { anthropic, DEFAULT_MODEL } from '../lib/ai/client';
import { pool } from '../lib/db';

const dryRun = process.argv.includes('--dry-run');

const reclassSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    type: z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria'),
    subtype: z.string().describe('Subtipo específico, ex. "Treinamento NR-35"; string vazia se não souber'),
  })),
});

async function main() {
  const { rows } = await pool.query<{ id: string; title: string; pain: string; type: string }>(
    `SELECT id, title, pain, type FROM app_opportunities WHERE type IN ('produto','servico') ORDER BY created_at`
  );
  if (rows.length === 0) {
    console.log('Nenhuma oportunidade legada (produto/servico) para reclassificar.');
    return;
  }
  console.log(`Reclassificando ${rows.length} oportunidades legadas${dryRun ? ' (dry-run)' : ''}...`);

  // Lotes de 20 para não estourar o contexto.
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { object } = await generateObject({
      model: anthropic(DEFAULT_MODEL),
      schema: reclassSchema,
      system: 'Você classifica oportunidades de negócio de uma consultoria de SST (EHS Brasil). Taxonomia: treinamento (cursos/capacitações), consultoria (projetos/diagnósticos/assessoria), sistema (software/ferramenta/produto digital). Responda para TODOS os ids recebidos.',
      prompt: batch.map((r) => `id: ${r.id}\ntítulo: ${r.title}\ndor: ${r.pain}\ntipo atual: ${r.type}`).join('\n---\n'),
    });
    for (const item of object.items) {
      const orig = batch.find((r) => r.id === item.id);
      if (!orig) continue; // id inventado pela IA — ignorar
      const subtype = item.subtype.trim() || null;
      console.log(`${orig.id} | "${orig.title}" | ${orig.type} -> ${item.type}${subtype ? ` (${subtype})` : ''}`);
      if (!dryRun) {
        await pool.query(`UPDATE app_opportunities SET type=$2, subtype=$3 WHERE id=$1`, [item.id, item.type, subtype]);
      }
    }
    const missing = batch.filter((r) => !object.items.some((it) => it.id === r.id));
    for (const m of missing) console.log(`${m.id} | "${m.title}" | SEM RESPOSTA DA IA — mantido como ${m.type}`);
  }
  console.log('Concluído. O log acima é o de-para de auditoria (salve se quiser).');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

(Conferir os exports reais de `lib/db` — se `pool` não for exportado, usar o mesmo padrão de conexão dos scripts existentes em `scripts/`.)

- [ ] **Step 2: Dry-run, revisar, aplicar**

```bash
npx tsx scripts/reclassify-opportunities.mts --dry-run
```

Revisar o de-para impresso. Se estiver coerente:

```bash
npx tsx scripts/reclassify-opportunities.mts | tee /tmp/reclass-opportunities-log.txt
```

Expected: todas as linhas `produto`/`servico` migradas; log de-para completo em `/tmp/reclass-opportunities-log.txt`.

- [ ] **Step 3: Conferir no banco**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" -c "SELECT type, count(*), count(subtype) AS com_subtipo FROM app_opportunities GROUP BY 1 ORDER BY 1;"
```

Expected: nenhuma linha `produto`/`servico` restante (a menos que a IA não tenha respondido para alguma — nesse caso rodar de novo ou classificar manualmente).

- [ ] **Step 4: Commit**

```bash
git add scripts/reclassify-opportunities.mts
git commit -m "feat: script de reclassificação IA das oportunidades legadas"
```

(O script fica no repo como ferramenta reexecutável — não é descartável, pois documenta a migração D7.)

---

## Task 6: "blog" → "artigo"

**Files:**
- Modify: `lib/ai/prompts/content-suggestions.ts:9-10,49,54`
- Modify: `components/ds/ContentCard.tsx:9` (map P)
- Modify: `components/ds/PlatformBadge.tsx:3,12-13`
- Modify: `components/badges/PlatformBadge.tsx:9`
- Modify: `app/conteudos/page.tsx:12,30`
- Modify: `styles/tokens/colors.css:48,80` (tokens artigo)
- SQL: migrar linhas legadas

- [ ] **Step 1: Prompt**

Em `lib/ai/prompts/content-suggestions.ts`, trocar:

```ts
  platform: z.enum(['youtube', 'linkedin', 'blog']).catch('linkedin').describe(
    'Plataforma ideal: youtube (vídeo/tutorial), linkedin (post/artigo curto) ou blog (artigo longo)'
  ),
```

por:

```ts
  platform: z.enum(['youtube', 'linkedin', 'artigo']).catch('linkedin').describe(
    'Plataforma ideal: youtube (vídeo/tutorial), linkedin (post/copy curta) ou artigo (texto longo)'
  ),
```

Na linha 49, trocar `(YouTube, LinkedIn ou blog)` por `(YouTube, LinkedIn ou artigo)`.
Na linha 54, trocar `guia aprofundado → blog` por `guia aprofundado → artigo`.

- [ ] **Step 2: Tokens de cor**

Em `styles/tokens/colors.css`, no fim da linha 48 (tema claro), acrescentar:

```css
--platform-artigo-bg:var(--accent-promo);--platform-artigo-fg:var(--textButtonPrimary);--platform-artigo-icon:var(--tagTextPromo);
```

E no fim da linha 80 (tema escuro):

```css
--platform-artigo-bg:var(--textButtonPrimary);--platform-artigo-fg:var(--accent-promo);--platform-artigo-icon:var(--accent-promo);
```

- [ ] **Step 3: Componentes**

`components/ds/ContentCard.tsx` map `P` — trocar a entrada `blog` por (mantendo alias para linhas legadas):

```ts
  artigo: { icon: "book-open", color: "var(--platform-artigo-icon)", label: "Artigo" },
  blog: { icon: "book-open", color: "var(--platform-blog-icon)", label: "Artigo" },
```

`components/ds/PlatformBadge.tsx`:

```ts
const PLATFORMS = ["youtube", "linkedin", "artigo", "blog"];
```

e no corpo, trocar o fallback e o texto renderizado:

```ts
  const p = PLATFORMS.includes(platform) ? platform : "artigo";
```

```tsx
      {platform === "blog" ? "artigo" : platform}
```

`components/badges/PlatformBadge.tsx:9` — no map de estilos, trocar a linha do blog por:

```ts
      artigo: 'bg-purple-100 text-purple-700',
      blog: 'bg-purple-100 text-purple-700',
```

`app/conteudos/page.tsx`:

```ts
  platform: "youtube" | "linkedin" | "artigo" | "blog";
```

```ts
const CT_PLATFORMS: Record<string, string> = { youtube: "YouTube", linkedin: "LinkedIn", artigo: "Artigo" };
```

- [ ] **Step 4: Migrar dados legados**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" -c "UPDATE app_contents SET platform='artigo' WHERE platform='blog'; SELECT platform, count(*) FROM app_contents GROUP BY 1;"
```
Expected: nenhuma linha `blog` restante.

- [ ] **Step 5: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add lib/ai/prompts/content-suggestions.ts components/ds/ContentCard.tsx components/ds/PlatformBadge.tsx components/badges/PlatformBadge.tsx app/conteudos/page.tsx styles/tokens/colors.css
git commit -m "feat: renomeia canal blog para artigo"
```

---

## Task 7: Filtro temporal também na geração de conteúdo

**Files:**
- Modify: `app/api/contents/analyze/route.ts`

A rota hoje pega as 20 conversas 'processado' mais recentes sem corpo de request. Adicionar o mesmo filtro `{from,to}` da Task 3.

- [ ] **Step 1: Editar `app/api/contents/analyze/route.ts`**

Adicionar imports no topo (junto aos existentes de drizzle):

```ts
import { and, gte, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
```

(mantendo `eq, desc` já importados; consolidar em um único import de 'drizzle-orm'.)

Antes da query de conversas, adicionar:

```ts
    const bodySchema = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos: use from/to como YYYY-MM-DD' }, { status: 400 });
    }
    const { from, to } = parsed.data;
    const filters: SQL[] = [eq(conversations.status, 'processado')];
    if (from) filters.push(gte(conversations.date, new Date(`${from}T00:00:00Z`)));
    if (to) filters.push(lte(conversations.date, new Date(`${to}T23:59:59Z`)));
```

E trocar o `.where(eq(conversations.status, 'processado'))` por `.where(and(...filters))`.

(Se a assinatura atual do handler for `POST()` sem parâmetro, mudá-la para `POST(request: NextRequest)` e importar `NextRequest`.)

- [ ] **Step 2: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/contents/analyze/route.ts
git commit -m "feat: filtro temporal na geração de sugestões de conteúdo"
```

---

## Task 8: Tela de detalhe do insight estratégico

**Files:**
- Create: `app/insights/[id]/page.tsx`

Mostra: descrição, recorrência com percentual, evidências com link para cada conversa, tipo de negócio, hipótese/metodologia e as decisões (útil = aprovar, dispensar = descartar, aprofundar = StartProjectButton — mesma semântica dos botões do card, reutilizando o PATCH existente).

- [ ] **Step 1: Criar `app/insights/[id]/page.tsx`**

```tsx
"use client";
import { use, useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button, StartProjectButton } from "@/components/ds";

interface InsightDetail {
  id: string;
  title: string;
  description: string;
  pattern: string;
  insightType: string;
  confidence: number;
  status: string;
  actionSuggestion: string | null;
  createdAt: string;
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
  isHypothesis?: boolean;
  notes?: string | null;
  conversationTitle?: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BT_LABEL: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema" };
const ST_LABEL: Record<string, string> = { new: "Novo", useful: "Aprovado", dismissed: "Descartado", archived: "Arquivado" };

export default function InsightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, mutate } = useSWR<{ data: InsightDetail }>(`/api/insights/${id}`, fetcher, {
    revalidateOnFocus: false,
  });
  const insight = data?.data;

  const setStatus = async (status: string) => {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate();
  };

  // Anotações da Andresa (D12) — editáveis e salvas via PATCH { notes }.
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => {
    setNotesDraft(insight?.notes ?? "");
  }, [insight?.notes]);
  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      await mutate();
    } finally {
      setSavingNotes(false);
    }
  };

  if (isLoading) return <div className="ds-card" style={{ height: 240 }} />;
  if (error || !insight) return <div style={{ padding: 16 }}>Insight não encontrado.</div>;

  const evidence = insight.evidence ?? [];

  return (
    <div style={{ maxWidth: 860 }}>
      <Link href="/insights" style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
        ← Voltar para insights
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px", flexWrap: "wrap" }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>{insight.title}</h1>
        {insight.businessType ? (
          <span className="ds-badge" style={{ background: `var(--opp-${insight.businessType}-bg)`, color: `var(--opp-${insight.businessType}-fg)` }}>
            {BT_LABEL[insight.businessType] ?? insight.businessType}
          </span>
        ) : null}
        <span className="ds-badge">{ST_LABEL[insight.status] ?? insight.status}</span>
      </div>
      <p style={{ font: "500 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)", margin: "0 0 16px" }}>
        📊 {insight.pattern} · Confiança {Math.round(insight.confidence * 100)}%
      </p>
      <p style={{ font: "400 15px/22px var(--font-sans)", margin: "0 0 16px" }}>{insight.description}</p>

      {insight.actionSuggestion ? (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <strong style={{ font: "500 13px/18px var(--font-sans)" }}>💡 Próxima ação sugerida</strong>
          <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>{insight.actionSuggestion}</p>
        </div>
      ) : null}

      {insight.methodology ? (
        <div className="ds-card" style={{ marginBottom: 16, borderLeft: "3px solid var(--color-primary)" }}>
          <strong style={{ font: "500 13px/18px var(--font-sans)", color: "var(--color-primary)" }}>
            🧪 Hipótese de metodologia (proposta da IA, requer sua aprovação)
          </strong>
          <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>{insight.methodology}</p>
        </div>
      ) : null}

      <h2 style={{ font: "400 18px/24px var(--fontFamily)", margin: "24px 0 8px" }}>
        Evidências ({evidence.length})
      </h2>
      {evidence.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {evidence.map((ev, i) => (
            <div key={i} className="ds-card">
              <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", fontStyle: "italic" }}>&ldquo;{ev.excerpt}&rdquo;</p>
              <Link
                href={`/conversas?open=${ev.conversationId}`}
                style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}
              >
                Ver conversa de origem →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)", marginBottom: 24 }}>
          Este insight foi gerado antes do registro de evidências. Gere novos insights para obter trechos-fonte.
        </p>
      )}

      <h2 style={{ font: "400 18px/24px var(--fontFamily)", margin: "24px 0 8px" }}>Minhas anotações</h2>
      <div className="ds-card" style={{ marginBottom: 24 }}>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Anote decisões, contexto ou próximos passos deste insight..."
          rows={4}
          style={{ width: "100%", boxSizing: "border-box", font: "400 14px/20px var(--font-sans)", background: "transparent", color: "inherit", border: "1px solid var(--color-border)", borderRadius: 6, padding: 8, resize: "vertical" }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={saveNotes}
          disabled={savingNotes || notesDraft === (insight.notes ?? "")}
          style={{ marginTop: 8 }}
        >
          {savingNotes ? "Salvando..." : "Salvar anotações"}
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {insight.status !== "useful" ? (
          <Button variant="primary" onClick={() => setStatus("useful")}>Aprovar</Button>
        ) : null}
        {insight.status !== "dismissed" ? (
          <Button variant="outline" onClick={() => setStatus("dismissed")}>Descartar</Button>
        ) : null}
        {insight.status !== "archived" ? (
          <Button variant="outline" onClick={() => setStatus("archived")}>Arquivar</Button>
        ) : null}
        <StartProjectButton sourceType="insight" sourceId={insight.id} title={insight.title} description={insight.description} />
      </div>
    </div>
  );
}
```

(O PATCH já aceita `notes` e o status `archived` pela Task 4 Step 2; se `Button` não tiver prop `disabled`/`size`, adaptar ao componente real.)

(Se `/conversas` não suportar o query param `open`, o link ainda leva à listagem — comportamento aceitável; ajuste fino fica para depois.)

- [ ] **Step 2: Linkar o card para o detalhe**

Em `app/insights/page.tsx`, envolver o `<InsightCard>` do `paged.map` com navegação: adicionar import `import { useRouter } from "next/navigation";`, `const router = useRouter();` no topo do componente, e no card adicionar a prop:

```tsx
                onChat={() => router.push(`/insights/${i.id}`)}
```

(Reuso do slot `onChat` — ícone de conversa — como "abrir detalhe" só se `onChat` não estiver em uso; caso já esteja, envolver o card em `<div onClickCapture>` não funciona por causa do click de enrichment. Alternativa direta: adicionar ao `action` um link:)

```tsx
                action={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <StartProjectButton sourceType="insight" sourceId={i.id} title={i.title} description={i.description} style={{ alignSelf: "flex-start" }} />
                    <a href={`/insights/${i.id}`} onClick={(e) => e.stopPropagation()} style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>
                      Detalhes →
                    </a>
                  </div>
                }
```

Usar a alternativa do `action` (não mexe no onChat).

- [ ] **Step 3: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add app/insights
git commit -m "feat: tela de detalhe do insight com evidências e decisão"
```

---

## Task 9: Estados editoriais de conteúdo

**Files:**
- Modify: `app/api/contents/[id]/route.ts` (ampliar status aceitos no PATCH)
- Modify: `components/ds/ContentCard.tsx:6` (STATUS map + botões)
- Modify: `app/conteudos/page.tsx:29` (CT_STATUS)

Fluxo (D9): `sugerido → rascunho → em_revisao → aprovado → publicado / descartado`. A publicação em si é manual e externa; "Marcar como publicado" apenas registra que aconteceu. Legado `producao` continua renderizando.

- [ ] **Step 1: PATCH aceita os novos status e o campo `draft` (D13)**

Em `app/api/contents/[id]/route.ts`, localizar a validação de status do PATCH (set/array de valores permitidos contendo `sugerido/producao/publicado/descartado`) e substituir por:

```ts
const ALLOWED_STATUS = new Set([
  'sugerido', 'rascunho', 'em_revisao', 'aprovado', 'publicado', 'descartado',
  // legado (linhas antigas / compat UI)
  'producao',
]);
```

E ampliar o corpo aceito pelo PATCH para incluir `draft` (edição manual do rascunho — D13), no mesmo padrão de UPDATE dinâmico da Task 4 Step 2:

```ts
    const body = await request.json();
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (typeof body.status === 'string') {
      if (!ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      values.push(body.status);
      sets.push(`status=$${values.length}`);
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      values.push(body.notes);
      sets.push(`notes=$${values.length}`);
    }
    if (typeof body.draft === 'string') {
      values.push(body.draft);
      sets.push(`draft=$${values.length}`);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    await pool.query(`UPDATE app_contents SET ${sets.join(', ')} WHERE id=$1`, values);
```

(Adaptar ao estilo real do arquivo — se ele usa Drizzle, montar o objeto do `.set()` condicionalmente com as mesmas regras; manter os campos que o PATCH já aceitava hoje, ex. `notes`.)

- [ ] **Step 2: `components/ds/ContentCard.tsx`**

Trocar o map STATUS por:

```ts
const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  sugerido: { bg: "var(--ct-sugerido-bg)", fg: "var(--ct-sugerido-fg)", label: "Sugerido" },
  rascunho: { bg: "var(--ct-producao-bg)", fg: "var(--ct-producao-fg)", label: "Rascunho" },
  em_revisao: { bg: "var(--ct-producao-bg)", fg: "var(--ct-producao-fg)", label: "Em revisão" },
  aprovado: { bg: "var(--ct-publicado-bg)", fg: "var(--ct-publicado-fg)", label: "Aprovado" },
  producao: { bg: "var(--ct-producao-bg)", fg: "var(--ct-producao-fg)", label: "Em produção" },
  publicado: { bg: "var(--ct-publicado-bg)", fg: "var(--ct-publicado-fg)", label: "Publicado" },
  descartado: { bg: "var(--ct-descartado-bg)", fg: "var(--ct-descartado-fg)", label: "Descartado" },
};
```

(Conferir no arquivo o shape real do map STATUS atual — se for `Record<string, string>` com cores via CSS vars `--ct-${status}-*` no JSX, apenas adicionar as chaves `rascunho`, `em_revisao`, `aprovado` reutilizando os pares de vars de `producao`/`publicado` como acima.)

Ajustar os botões de ação por status (bloco atual "Aprovar/Descartar" para `sugerido` e "Marcar como Publicado" para `producao`):

```tsx
      {status === "sugerido" && (onApprove || onDiscard) ? (
        <div style={{ display: "flex", gap: 8 }}>
          {onApprove ? <Button variant="primary" size="sm" onClick={onApprove}>Gerar rascunho</Button> : null}
          {onDiscard ? <Button variant="outline" size="sm" onClick={onDiscard}>Descartar</Button> : null}
        </div>
      ) : null}
      {status === "rascunho" && onApprove ? (
        <Button variant="outline" size="sm" onClick={onApprove}>Enviar para revisão</Button>
      ) : null}
      {status === "em_revisao" && onApprove ? (
        <Button variant="primary" size="sm" onClick={onApprove}>Aprovar</Button>
      ) : null}
      {status === "aprovado" && onApprove ? (
        <Button variant="outline" size="sm" onClick={onApprove}>Marcar como publicado</Button>
      ) : null}
```

(Manter os handlers existentes `onApprove`/`onDiscard` — ou os nomes reais das props do arquivo; a página decide qual status gravar.)

- [ ] **Step 3: `app/conteudos/page.tsx`**

```ts
const CT_STATUS: Record<string, string> = {
  sugerido: "Sugerido", rascunho: "Rascunho", em_revisao: "Em revisão",
  aprovado: "Aprovado", descartado: "Descartado",
  producao: "Em produção", publicado: "Publicado",
};
```

E ampliar o union do status na interface `Content`:

```ts
  status: "sugerido" | "rascunho" | "em_revisao" | "aprovado" | "descartado" | "producao" | "publicado";
```

No handler que hoje chama `setSt(id, 'producao')` no Aprovar do card sugerido: passar a chamar a geração de rascunho (Task 10) — a rota já grava `status='rascunho'`; "Enviar para revisão" → `setSt(id, 'em_revisao')`; "Aprovar" → `setSt(id, 'aprovado')`; "Marcar como publicado" (card em `aprovado`) → `setSt(id, 'publicado')` (D9 — registra manualmente que o conteúdo foi publicado fora do sistema).

- [ ] **Step 4: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add app/api/contents/\[id\]/route.ts components/ds/ContentCard.tsx app/conteudos/page.tsx
git commit -m "feat: estados editoriais até publicado e PATCH de rascunho editável"
```

---

## Task 9b: Extrair o tom de voz do workflow do clone no n8n (D11 — somente leitura)

**Files:**
- Nenhum arquivo de código nesta task; o resultado é o texto do bloco "Tom de voz" usado na Task 10 (`ARTICLE_DRAFT_SYSTEM_PROMPT`).

O usuário autorizou a **leitura** do workflow do clone via API do n8n para extrair as regras de como a Andresa se expressa, escreve e compõe. **NENHUMA escrita/modificação no n8n** — apenas `GET`. Nunca imprimir a API key.

- [ ] **Step 1: Listar workflows e localizar o do clone**

As variáveis vêm do `.env` do repo (`N8N_URL`, `N8N_API_KEY`) — carregar sem echo:

```bash
set -a; source /Users/wesleycardoso/Redpine/ehs-insights/ehs-insights/.env >/dev/null 2>&1; set +a
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows" \
  | python3 -c "import json,sys; [print(w['id'], '|', w['name'], '| active:', w['active']) for w in json.load(sys.stdin)['data']]"
```

Expected: lista de workflows; identificar o do clone pelo nome (algo como "Clone Andrezza" / "clone" / nome da Andresa). Se os nomes das variáveis no `.env` forem outros (conferir com `grep -i n8n .env | cut -d= -f1` — só os nomes, nunca os valores), ajustar.

- [ ] **Step 2: Baixar o workflow do clone e extrair os prompts dos nós de IA**

```bash
WORKFLOW_ID=<id identificado no Step 1>
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/$WORKFLOW_ID" > /tmp/clone-workflow.json
python3 - <<'PY'
import json
wf = json.load(open('/tmp/clone-workflow.json'))
for node in wf.get('nodes', []):
    params = json.dumps(node.get('parameters', {}), ensure_ascii=False)
    if any(k in params.lower() for k in ('prompt', 'system', 'tom', 'voz', 'estilo')):
        print('='*80)
        print('NÓ:', node.get('name'), '| tipo:', node.get('type'))
        print(json.dumps(node.get('parameters', {}), ensure_ascii=False, indent=2)[:4000])
PY
```

Ler os system prompts encontrados e anotar as regras de tom/estilo/composição (vocabulário, estrutura de frase, o que evitar, assinaturas de estilo da Andresa).

- [ ] **Step 3: Incorporar no `ARTICLE_DRAFT_SYSTEM_PROMPT` da Task 10**

Substituir/enriquecer o bloco "Tom de voz" do prompt da Task 10 Step 1 com as regras reais extraídas (mantendo as regras já listadas que não conflitarem, em especial a proibição de travessões). Se a extração falhar (API fora do ar, workflow não encontrado), seguir com o tom de voz genérico já escrito na Task 10 e registrar a pendência no commit.

- [ ] **Step 4: Limpeza**

```bash
rm -f /tmp/clone-workflow.json
```

(O JSON do workflow pode conter prompts sensíveis — não deixar cópia nem commitar nada dele; o que vai para o repo é só o texto de tom de voz dentro de `article-draft.ts`.)

---

## Task 10: Geração de artigo completo e copy social (rascunho)

**Files:**
- Create: `lib/ai/prompts/article-draft.ts`
- Create: `app/api/contents/[id]/draft/route.ts`
- Modify: `app/conteudos/page.tsx` (botão "Gerar rascunho" chama a rota; exibir draft)

- [ ] **Step 1: Criar `lib/ai/prompts/article-draft.ts`**

```ts
import { z } from 'zod';

export const articleDraftSchema = z.object({
  title: z.string().describe('Título final do conteúdo'),
  body: z.string().describe('Texto integral do rascunho, em markdown'),
});

export type ArticleDraft = z.infer<typeof articleDraftSchema>;

// Tom de voz da Andresa + regras de linguagem para conteúdo externo
// (reunião 2026-08-25): sem travessões, sem jargão de IA, sempre rascunho para
// revisão humana — nunca texto "pronto para publicar" sem aprovação.
// D11: o bloco "Tom de voz" abaixo é um fallback — substituir pelas regras
// reais extraídas do workflow do clone no n8n (Task 9b, somente leitura).
export const ARTICLE_DRAFT_SYSTEM_PROMPT = `Você é um redator da EHS Brasil (consultoria de segurança e saúde do trabalho) escrevendo em nome da Andresa.

Tom de voz:
- Direto, profissional e próximo; autoridade técnica sem arrogância
- Português brasileiro natural, frases curtas, exemplos práticos do dia a dia de SST
- Sem clichês de LinkedIn, sem hashtags excessivas, sem emojis em artigos

Regras de linguagem obrigatórias:
- NUNCA use travessão (—) em nenhuma parte do texto; use vírgula, dois-pontos ou reformule a frase
- Não invente dados, estatísticas ou casos; escreva apenas a partir do material-fonte fornecido
- Quando citar uma situação vinda das conversas, generalize (sem nomes de clientes ou pessoas)

Formato por plataforma:
- artigo: texto longo em markdown com título, introdução, seções com subtítulos e conclusão com chamada para conversa (800 a 1500 palavras)
- linkedin: copy pronta de post (120 a 250 palavras), gancho forte na primeira linha, parágrafos de 1-2 frases, encerrando com pergunta ou convite ao diálogo
- youtube: roteiro estruturado com gancho, blocos numerados do vídeo e encerramento

Este texto é um RASCUNHO para revisão da Andresa, não uma versão final.`;

export function createArticleDraftPrompt(input: {
  platform: string;
  theme: string;
  title: string;
  angle: string | null;
  outlinePoints: string[];
  sources: { conversationTitle: string | null; excerpt: string | null }[];
}): string {
  const sourceBlock = input.sources.length
    ? input.sources
        .map((s, i) => `${i + 1}. ${s.conversationTitle ? `(${s.conversationTitle}) ` : ''}${s.excerpt ?? 'sem trecho registrado'}`)
        .join('\n')
    : 'Nenhum trecho-fonte registrado; escreva a partir do tema e da pauta.';

  return `Escreva o rascunho completo para a plataforma "${input.platform}".

Tema: ${input.theme}
Título de trabalho: ${input.title}
Ângulo: ${input.angle ?? 'não definido'}

Pauta (pontos a cobrir):
${input.outlinePoints.length ? input.outlinePoints.map((p) => `- ${p}`).join('\n') : '- (sem pauta registrada)'}

Trechos-fonte das conversas de origem:
${sourceBlock}

Produza o texto integral seguindo o tom de voz e as regras de linguagem. Lembre-se: nenhum travessão.`;
}
```

- [ ] **Step 2: Criar `app/api/contents/[id]/draft/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { anthropic, DEFAULT_MODEL } from '@/lib/ai/client';
import { pool } from '@/lib/db';
import {
  articleDraftSchema,
  ARTICLE_DRAFT_SYSTEM_PROMPT,
  createArticleDraftPrompt,
} from '@/lib/ai/prompts/article-draft';

interface ContentRow {
  id: string;
  title: string;
  platform: string;
  theme: string;
  outline: string | null;
}

/**
 * Gera o rascunho completo (artigo, copy de LinkedIn ou roteiro de YouTube) a
 * partir da pauta + trechos-fonte de app_content_sources. Grava em
 * app_contents.draft, marca kind='artigo_completo' e status='rascunho'.
 * A publicação continua 100% humana.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contentRes = await pool.query<ContentRow>(
      `SELECT id, title, platform, theme, outline FROM app_contents WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (contentRes.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    const content = contentRes.rows[0];

    // Pauta: outline pode ser JSON {angle, points[]} ou texto puro (legado).
    let angle: string | null = null;
    let outlinePoints: string[] = [];
    if (content.outline) {
      try {
        const parsed = JSON.parse(content.outline);
        angle = typeof parsed.angle === 'string' ? parsed.angle : null;
        outlinePoints = Array.isArray(parsed.points) ? parsed.points : [];
      } catch {
        outlinePoints = [content.outline];
      }
    }

    const sourcesRes = await pool.query<{ excerpt: string | null; conversation_title: string | null }>(
      `SELECT s.excerpt, c.title AS conversation_title
         FROM app_content_sources s
         LEFT JOIN conversations c ON c.id = s.conversation_id
        WHERE s.content_id = $1`,
      [id]
    );

    const { object } = await generateObject({
      model: anthropic(DEFAULT_MODEL),
      schema: articleDraftSchema,
      system: ARTICLE_DRAFT_SYSTEM_PROMPT,
      prompt: createArticleDraftPrompt({
        platform: content.platform,
        theme: content.theme,
        title: content.title,
        angle,
        outlinePoints,
        sources: sourcesRes.rows.map((r) => ({
          conversationTitle: r.conversation_title,
          excerpt: r.excerpt,
        })),
      }),
    });

    // Rede de segurança da regra "sem travessões" no conteúdo externo.
    const body = object.body.replace(/—/g, ',');
    const title = object.title.replace(/—/g, ',');

    await pool.query(
      `UPDATE app_contents SET draft=$2, kind='artigo_completo', status='rascunho' WHERE id=$1`,
      [id, `# ${title}\n\n${body}`]
    );

    return NextResponse.json({ data: { id, title, draft: body, status: 'rascunho' } });
  } catch (error) {
    console.error('[API] POST /api/contents/[id]/draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}
```

(Conferir os exports reais de `lib/ai/client` — o repo usa `anthropic(DEFAULT_MODEL)` nos serviços existentes, ex. `lib/ai/services/cross-insight-analyzer.ts`; copiar exatamente o mesmo import de lá.)

- [ ] **Step 3: Ligar na página**

Em `app/conteudos/page.tsx`, adicionar handler:

```ts
  const [drafting, setDrafting] = useState<string | null>(null);
  const generateDraft = async (id: string) => {
    setDrafting(id);
    try {
      const res = await fetch(`/api/contents/${id}/draft`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao gerar rascunho (HTTP ${res.status}).`);
        return;
      }
      await mutate();
    } finally {
      setDrafting(null);
    }
  };
```

E no `<ContentCard>` do map, o handler de aprovar do estado `sugerido` passa a chamar `generateDraft(c.id)` (a rota já grava `status='rascunho'` — não é preciso PATCH adicional). Exibir o rascunho: adicionar `draft?: string | null;` à interface `Content`, e passar ao card ou renderizar num `<details>` abaixo do outline (padrão do `parseOutline` existente):

```tsx
                {c.draft ? (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ font: "500 12px/16px var(--font-sans)", cursor: "pointer" }}>Ver / editar rascunho</summary>
                    <DraftEditor id={c.id} draft={c.draft} onSaved={mutate} onRegenerate={() => generateDraft(c.id)} regenerating={drafting === c.id} />
                  </details>
                ) : null}
```

(Posicionar dentro do wrapper do card na página; se o card não aceitar children, envolver `<ContentCard>` + `<details>` numa `<div>` da grade.)

- [ ] **Step 3b (D13): Componente `DraftEditor` — editar, salvar e regenerar**

No mesmo `app/conteudos/page.tsx` (fora do componente da página), adicionar:

```tsx
function DraftEditor({
  id,
  draft,
  onSaved,
  onRegenerate,
  regenerating,
}: {
  id: string;
  draft: string;
  onSaved: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [text, setText] = useState(draft);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(draft), [draft]);
  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/contents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: text }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        style={{ width: "100%", boxSizing: "border-box", font: "400 13px/19px var(--font-sans)", background: "transparent", color: "inherit", border: "1px solid var(--color-border)", borderRadius: 6, padding: 8, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || text === draft}>
          {saving ? "Salvando..." : "Salvar rascunho"}
        </Button>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? "Regenerando..." : "Regenerar"}
        </Button>
      </div>
    </div>
  );
}
```

("Regenerar" chama o mesmo `POST /draft` — sobrescreve o texto atual com uma nova geração; "Salvar rascunho" usa o PATCH `{draft}` da Task 9 Step 1. Import de `useState`/`useEffect` já deve existir na página; conferir. Se `Button` não aceitar `disabled`, usar `<button>` com classes ds equivalentes.)

Também incluir `draft` no SELECT do GET `/api/contents` (rota `app/api/contents/route.ts`): adicionar a coluna `draft` à query e ao objeto mapeado (`draft: r.draft ?? null`).

- [ ] **Step 4: Verificação real**

Com `npm run dev` rodando e pelo menos 1 conteúdo `sugerido` existente:

```bash
CONTENT_ID=$(curl -s 'http://localhost:3000/api/contents?limit=1&status=sugerido' | python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['id'])")
curl -s -X POST "http://localhost:3000/api/contents/$CONTENT_ID/draft" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('status:', d['status']); print('travessões:', d['draft'].count(chr(8212))); print(d['draft'][:300])"
```
Expected: `status: rascunho`, `travessões: 0`, texto coerente com o tema.

- [ ] **Step 5: Typecheck, build, commit**

```bash
npx tsc --noEmit && npm run build
git add lib/ai/prompts/article-draft.ts app/api/contents app/conteudos/page.tsx
git commit -m "feat: geração de artigo completo e copy social em rascunho com tom de voz"
```

---

## Task 11: Verificação final e limpeza

- [ ] **Step 1:** `npx tsc --noEmit && npm run build` — sem erros.
- [ ] **Step 2:** Smoke manual no browser (`npm run dev`):
  - **/insights**: gerar insights com insights `new` existentes → diálogo manter/arquivar/descartar aparece (D5); ver "X de Y (Z%)"; selo "Oportunidade real" e filtro "somente oportunidades reais" (D6); aba "Padrões observados" com métricas (D6); abrir detalhe → salvar anotação (D12), botão Arquivar (D5), aprovar/descartar.
  - **/oportunidades**: badges de tipo novos e legados; badge de subtipo quando existir (D8).
  - **/conteudos**: plataforma Artigo; gerar rascunho; editar rascunho + "Salvar rascunho" + "Regenerar" (D13); fluxo sugerido→rascunho→em revisão→aprovado→"Marcar como publicado" (D9).
- [ ] **Step 3:** Conferir dados:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DB_URL=$(cat /Users/wesleycardoso/Redpine/meetings_access | tr -d '[:space:]')
psql "$DB_URL" -c "SELECT insight_type, count(*), count(*) FILTER (WHERE frequency IS NOT NULL) AS com_recorrencia, count(notes) AS com_notas, count(*) FILTER (WHERE status='archived') AS arquivados FROM app_cross_insights GROUP BY 1;"
psql "$DB_URL" -c "SELECT type, count(*), count(subtype) AS com_subtipo FROM app_opportunities GROUP BY 1 ORDER BY 1;"
psql "$DB_URL" -c "SELECT status, count(*), count(draft) AS com_rascunho FROM app_contents GROUP BY 1 ORDER BY 1;"
```

Expected: nenhuma oportunidade `produto`/`servico` restante (Task 5b); rascunhos gravados em `draft`; status `archived`/`publicado` funcionando quando usados.

- [ ] **Step 4:** Remover script descartável:

```bash
git rm scripts/verify/insights-analyze.mts
git commit -m "chore: remove script de verificação descartável"
```

---

## Backlog (longo prazo — reunião, sem tasks neste plano)

1. **Pesquisa de mercado/metodologias** com fontes e data da pesquisa, apresentada como apoio estratégico (nunca como fato automático).
2. **Publicação assistida** (LinkedIn primeiro, se a integração for autorizada) — sempre após aprovação humana.
3. **Imagens geradas para posts** — só depois de validar o fluxo editorial de texto.
4. **Filtros temporais no clone local** (`app/api/clone/chat/route.ts`) com links para conversa/insight de origem — sem tocar no clone Andrezza.

## Oportunidades adicionais identificadas (fora da reunião)

1. **Ingestão confiável do Plaud** — plano dedicado: `docs/superpowers/plans/2026-08-26-ingestao-plaud-sempre-completa.md` (tokens duráveis, reconciliação agendada, backfill dos 75).
2. **Alerta ativo** quando `app_ingest_runs` registrar falha ou `missingCount > 0` (e-mail/Slack) — barato após o plano de ingestão.
3. **Retenção de execuções do n8n** muito curta impede auditoria; aumentar `EXECUTIONS_DATA_MAX_AGE` na instância (decisão de infra do usuário).
4. **Higiene de segredos**: `/Users/wesleycardoso/Redpine/meetings_access` guarda senha de superusuário em texto puro fora de um cofre; migrar para variável de ambiente/secret manager local.
5. **`app_cross_insight_conversations` sem índices** — se o M:N crescer, adicionar índice em `cross_insight_id` (hoje a tabela nasce vazia; observar).
