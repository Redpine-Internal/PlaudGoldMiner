import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getFileContent } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';
import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getConversationAiAnalysisById } from '@/lib/ai/conversation-analysis-store';

// Plaud recording ids are 32-hex; they don't exist in our DB until analyzed.
const analyzeRequestSchema = z.object({
  fileId: z.string().regex(/^[0-9a-f]{32}$/i, 'Invalid Plaud file id'),
});

function toTimestamp(dateStr: string): Date {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Bridge: analyze a real Plaud recording into local opportunities.
 *
 * The Plaud recording lives only in the Plaud API (32-hex id) — /api/process
 * requires a local UUID conversation. This endpoint persists the recording as a
 * local conversation (upsert by sourceFileId so re-analyzing doesn't duplicate),
 * runs the same AI pipeline, and returns the LOCAL conversation id so the UI can
 * show the generated opportunities.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId } = analyzeRequestSchema.parse(body);

    // Pull transcript/summary/topics from the real Plaud recording.
    const { file, transcript, summary, topics } = await getFileContent(fileId);

    if (!transcript || transcript.trim().length === 0) {
      return Response.json(
        { error: 'Esta gravação ainda não tem transcrição no Plaud para analisar.' },
        { status: 400 }
      );
    }

    // Upsert the local conversation by sourceFileId (the Plaud recording id).
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sourceFileId, fileId))
      .limit(1);

    // A operação é idempotente. Se esta gravação já foi analisada, devolvemos
    // o resultado persistido (inclusive o formato legado) em vez de consumir
    // IA novamente e duplicar oportunidades.
    if (existing) {
      const persisted = await getConversationAiAnalysisById(existing.id);
      if (persisted?.analysis) {
        const existingOpportunities = await db
          .select()
          .from(opportunities)
          .where(eq(opportunities.conversationId, existing.id));

        return Response.json({
          data: {
            conversationId: existing.id,
            conversation: existing,
            opportunities: existingOpportunities,
            problems: persisted.analysis.problems,
            aiAnalysis: persisted.analysis,
          },
        });
      }
    }

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
      await db
        .update(conversations)
        .set({
          transcription: transcript,
          status: 'processando',
          // updated_at é setado pelo trigger INSTEAD OF da view (now()).
        })
        .where(eq(conversations.id, conversationId));
    } else {
      conversationId = crypto.randomUUID();
      await db.insert(conversations).values({
        id: conversationId,
        title: file.name || 'Conversa do Plaud',
        date: toTimestamp(file.start_at || file.created_at || ''),
        type: 'reuniao',
        status: 'processando',
        transcription: transcript,
        summary: summary || null,
        topics: topics.length ? JSON.stringify(topics) : null,
        source: 'plaud',
        sourceFileId: fileId,
      });
    }

    // Run the shared AI pipeline.
    const result = await processTranscription(transcript);

    if (!result.success) {
      await markConversationError(conversationId);
      const rateLimited = result.error.code === 'RATE_LIMIT';
      return Response.json(
        { error: result.error.message, code: result.error.code },
        { status: rateLimited ? 429 : 500 }
      );
    }

    const { conversation, opportunities: createdOpportunities, aiAnalysis } = await persistTranscriptionResult(
      conversationId,
      result.data,
      existing?.title || file.name
    );

    return Response.json({
      data: {
        conversationId,
        conversation,
        opportunities: createdOpportunities,
        problems: result.data.problems,
        aiAnalysis,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          error: 'Validation failed',
          details: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/analyze plaud auth error:', error);
      return Response.json(
        { error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' },
        { status: 401 }
      );
    }
    console.error('[API] POST /api/plaud/analyze error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
