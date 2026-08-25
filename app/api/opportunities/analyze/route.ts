import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { and, eq, isNotNull, notExists, sql } from 'drizzle-orm';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';

export async function POST(request: NextRequest) {
  try {
    const eligibleConversations = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.status, 'processado'),
          isNotNull(conversations.transcription),
          sql`trim(${conversations.transcription}) <> ''`,
          notExists(
            db
              .select()
              .from(opportunities)
              .where(eq(opportunities.conversationId, conversations.id))
          )
        )
      )
      .limit(20);

    if (!eligibleConversations.length) {
      return NextResponse.json({
        data: [],
        processed: 0,
        message: 'Nenhuma conversa elegível para detectar oportunidades.',
      });
    }

    const createdOpportunities = [];
    let processed = 0;
    let failed = 0;

    for (const conversation of eligibleConversations) {
      try {
        await db
          .update(conversations)
          .set({ status: 'processando' })
          .where(eq(conversations.id, conversation.id));

        const result = await processTranscription(conversation.transcription!);
        if (!result.success) throw result.error;

        const { opportunities: created } = await persistTranscriptionResult(
          conversation.id,
          result.data,
          conversation.title
        );
        createdOpportunities.push(...created);
        processed++;
      } catch (error) {
        console.error('[API] POST /api/opportunities/analyze error:', error);
        await markConversationError(conversation.id);
        failed++;
      }
    }

    return NextResponse.json({ data: createdOpportunities, processed, failed });
  } catch (error) {
    console.error('[API] POST /api/opportunities/analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
