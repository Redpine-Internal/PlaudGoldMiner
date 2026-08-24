import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { TranscriptionResult } from './prompts/process-transcription';

/**
 * Persist a successful AI transcription result against an existing conversation:
 * updates the conversation row (summary/topics/participants/type/status) and
 * inserts one opportunity row per detected opportunity.
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
  await db
    .update(conversations)
    .set({
      status: 'processado',
      summary: aiResult.summary,
      topics: JSON.stringify(aiResult.topics),
      participants: JSON.stringify(aiResult.participants),
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
        score: opp.score,
        status: 'nova',
      })
      .returning();
    createdOpportunities.push(created);
  }

  const [updatedConversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return { conversation: updatedConversation, opportunities: createdOpportunities };
}

/** Mark a conversation as errored (AI processing failed). */
export async function markConversationError(conversationId: string) {
  await db
    .update(conversations)
    .set({ status: 'erro' })
    .where(eq(conversations.id, conversationId));
}
