import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getFileContent } from '@/lib/plaud/client';
import { PlaudAuthError } from '@/lib/plaud/tokens';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

    const { conversation, opportunities } = await persistTranscriptionResult(
      conversationId,
      result.data,
      existing?.title || file.name
    );

    return Response.json({
      data: {
        conversationId,
        conversation,
        opportunities,
        problems: result.data.problems,
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
      return Response.json({ error: error.message, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/analyze error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
