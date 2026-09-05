import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { formatZodError } from '@/lib/validators/conversation';
import {
  MAX_FILE_SIZE,
  isValidFileExtension,
  uploadMetadataSchema,
} from '@/lib/validators/upload';

// POST /api/conversations/upload - Upload a transcription file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!isValidFileExtension(file.name)) {
      return Response.json(
        { error: 'Invalid file type. Accepted: .txt, .json' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: 'File too large. Maximum size: 10MB' },
        { status: 413 }
      );
    }

    // Read file content
    const content = await file.text();
    if (!content.trim()) {
      return Response.json({ error: 'O arquivo está vazio.' }, { status: 400 });
    }

    // Validate JSON if it's a JSON file
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch {
        return Response.json(
          { error: 'Invalid JSON format' },
          { status: 400 }
        );
      }
    }

    // Parse optional metadata from form data
    const metadataRaw = {
      title: formData.get('title') as string | null,
      type: formData.get('type') as string | null,
      date: formData.get('date') as string | null,
      duration: formData.get('duration') as string | null,
    };

    const parsedMetadata = uploadMetadataSchema.safeParse({
      title: metadataRaw.title || undefined,
      type: metadataRaw.type || undefined,
      date: metadataRaw.date || undefined,
      duration: metadataRaw.duration || undefined,
    });
    if (!parsedMetadata.success) {
      return Response.json(formatZodError(parsedMetadata.error), { status: 400 });
    }
    const metadata = parsedMetadata.data;

    // Generate title from filename if not provided
    const title = metadata.title || file.name.replace(/\.(txt|json)$/i, '');

    // Create conversation record.
    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write.
    const newId = crypto.randomUUID();
    await db
      .insert(conversations)
      .values({
        id: newId,
        title,
        date: metadata.date || new Date(),
        duration: metadata.duration,
        type: metadata.type || 'outro',
        status: 'pendente',
        transcription: content,
        source: 'upload',
      });

    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, newId))
      .limit(1);

    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /api/conversations/upload error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
