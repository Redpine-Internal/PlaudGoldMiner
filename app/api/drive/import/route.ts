import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getDriveFileContent } from '@/lib/drive/client';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

    // Extract title from filename (remove extension)
    const title = validated.fileName.replace(/\.[^/.]+$/, '');

    const conversationId = randomUUID();

    // Save to database.
    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write.
    await db
      .insert(conversations)
      .values({
        id: conversationId,
        title,
        date: new Date(),
        type: 'nao_classificado',
        source: 'drive',
        sourceFileId: validated.fileId,
        status: 'pendente',
        transcription: content,
      });

    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return NextResponse.json(
      {
        data: created,
        message: 'Arquivo importado. Classifique a gravação no acervo antes de analisá-la.',
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
