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
