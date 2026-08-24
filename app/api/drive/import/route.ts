import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getDriveFileContent } from '@/lib/drive/client';
import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const importSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated with Google' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = importSchema.parse(body);

    // Get file content from Drive
    const content = await getDriveFileContent(
      session.accessToken,
      validated.fileId,
      validated.mimeType
    );

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'File is empty or could not be read' },
        { status: 400 }
      );
    }

    // Process transcription with AI
    const processed = await processTranscription(content);

    if (!processed.success) {
      return NextResponse.json(
        { error: processed.error?.message || 'Failed to process transcription' },
        { status: 500 }
      );
    }

    const { data } = processed;

    // Extract title from filename (remove extension)
    const title = validated.fileName.replace(/\.[^/.]+$/, '');

    const conversationId = randomUUID();

    // Save to database.
    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write.
    await db
      .insert(conversations)
      .values({
        id: conversationId,
        title: data.suggestedTitle || title,
        date: new Date(),
        type: data.suggestedType || 'outro',
        source: 'drive',
        sourceFileId: validated.fileId,
        status: 'processado',
        transcription: content,
        participants: JSON.stringify(data.participants || []),
        summary: data.summary,
        topics: JSON.stringify(data.topics || []),
      });

    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    // Save opportunities
    if (data.opportunities && data.opportunities.length > 0) {
      await db.insert(opportunities).values(
        data.opportunities.map((opp) => ({
          id: randomUUID(),
          conversationId,
          title: opp.title,
          pain: opp.pain,
          context: opp.context,
          type: opp.type,
          score: opp.score,
          status: 'nova' as const,
        }))
      );
    }

    return NextResponse.json(
      {
        data: created,
        processed: {
          titulo: data.suggestedTitle,
          participantes: data.participants?.length || 0,
          oportunidades: data.opportunities?.length || 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error importing from Drive:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
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

    return NextResponse.json(
      { error: 'Failed to import file from Drive' },
      { status: 500 }
    );
  }
}
