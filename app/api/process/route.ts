import { NextRequest } from 'next/server';
import { z } from 'zod';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Request validation schema
const processRequestSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
});

// POST /api/process - Process a conversation's transcription with AI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId } = processRequestSchema.parse(body);

    // Fetch the conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Check if transcription exists
    if (!conversation.transcription) {
      return Response.json(
        { error: 'Conversation has no transcription to process' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db
      .update(conversations)
      .set({
        status: 'processando',
        // updated_at é setado pelo trigger INSTEAD OF da view (now()).
      })
      .where(eq(conversations.id, conversationId));

    // Process with AI
    const result = await processTranscription(conversation.transcription);

    if (!result.success) {
      await markConversationError(conversationId);
      return Response.json(
        {
          error: 'AI processing failed',
          details: result.error,
        },
        { status: 500 }
      );
    }

    const aiResult = result.data;

    // Persist AI results (conversation update + opportunities) via shared helper.
    const { conversation: updatedConversation, opportunities: createdOpportunities } =
      await persistTranscriptionResult(conversationId, aiResult, conversation.title);

    return Response.json({
      data: {
        conversation: updatedConversation,
        opportunities: createdOpportunities,
        problems: aiResult.problems,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          error: 'Validation failed',
          details: error.issues.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    console.error('[API] POST /api/process error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
