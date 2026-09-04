import { db } from '@/lib/db';
import { conversations, opportunities, opportunitySources } from '@/lib/db/schema';
import { marcarProcedencia } from '@/lib/ai/excerpt-provenance';
import { eq } from 'drizzle-orm';
import type { TranscriptionResult } from './prompts/process-transcription';
import {
  createConversationAiAnalysis,
  saveConversationAiAnalysis,
} from './conversation-analysis-store';

/**
 * Persist a successful AI transcription result against an existing conversation:
 * updates the conversation and inserts one opportunity per detected item. For
 * Plaud sources, its original summary stays untouched and the application AI
 * result is persisted independently in meetings.metadata.ai_analysis.
 *
 * Shared by POST /api/process (seed/upload conversations) and
 * POST /api/plaud/analyze (Plaud recordings persisted on demand) so the two
 * entry points stay in lockstep.
 *
 * `conversationId` must already exist in the DB.
 */
export async function persistTranscriptionResult(
  conversationId: string,
  aiResult: TranscriptionResult,
  currentTitle?: string | null
) {
  const [currentConversation] = await db
    .select({ source: conversations.source })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!currentConversation) {
    throw new Error(`Conversation not found while persisting AI result: ${conversationId}`);
  }

  const isPlaudConversation = currentConversation.source === 'plaud';
  const aiAnalysis = isPlaudConversation
    ? createConversationAiAnalysis(aiResult)
    : null;

  if (aiAnalysis) {
    await saveConversationAiAnalysis(conversationId, aiAnalysis);
  }

  await db
    .update(conversations)
    .set({
      status: 'processado',
      // Em gravações Plaud, estes campos pertencem ao conteúdo original. A
      // análise da aplicação fica isolada em meetings.metadata.ai_analysis.
      ...(isPlaudConversation
        ? {}
        : {
            summary: aiResult.summary,
            topics: JSON.stringify(aiResult.topics),
            participants: JSON.stringify(aiResult.participants),
          }),
      title: currentTitle || aiResult.suggestedTitle,
      type: aiResult.suggestedType,
      // updated_at é setado pelo trigger INSTEAD OF da view (now()).
    })
    .where(eq(conversations.id, conversationId));

  const createdOpportunities = [];
  for (const opp of aiResult.opportunities) {
    const [created] = await db
      .insert(opportunities)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        title: opp.title,
        pain: opp.pain,
        context: opp.context,
        type: opp.type,
        subtype: opp.subtype?.trim() ? opp.subtype.trim() : null,
        score: opp.score,
        status: 'nova',
      })
      .returning();
    createdOpportunities.push(created);

    // Registra a conversa como fonte da oportunidade, com o trecho que a
    // justifica. Hoje o gerador analisa uma conversa por vez, então nasce
    // sempre com uma fonte; a tabela suporta N.
    await db
      .insert(opportunitySources)
      .values({
        id: crypto.randomUUID(),
        opportunityId: created.id,
        conversationId,
        // Este caminho analisa a transcrição inteira, então o trecho é fala.
        excerpt: marcarProcedencia(opp.excerpt?.trim() ? opp.excerpt.trim() : null, true),
      })
      .onConflictDoNothing();
  }

  const [updatedConversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return { conversation: updatedConversation, opportunities: createdOpportunities, aiAnalysis };
}

/** Mark a conversation as errored (AI processing failed). */
export async function markConversationError(conversationId: string) {
  await db
    .update(conversations)
    .set({ status: 'erro' })
    .where(eq(conversations.id, conversationId));
}
