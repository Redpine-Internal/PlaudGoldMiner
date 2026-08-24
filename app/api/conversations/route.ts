import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  conversationCreateSchema,
  conversationListSchema,
  formatZodError,
} from '@/lib/validators/conversation';

// GET /api/conversations - List conversations with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = conversationListSchema.parse({
      status: searchParams.get('status') || undefined,
      type: searchParams.get('type') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    // Build where conditions
    const conditions = [];
    if (params.status) {
      conditions.push(eq(conversations.status, params.status));
    }
    if (params.type) {
      conditions.push(eq(conversations.type, params.type));
    }

    // Execute query
    const result = await db
      .select()
      .from(conversations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(conversations.date))
      .limit(params.limit);

    // Get total count for pagination info
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return Response.json({
      data: result,
      total: countResult[0]?.count ?? 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] GET /api/conversations error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = conversationCreateSchema.parse(body);

    // Prepare data for insertion
    const newConversation = {
      id: crypto.randomUUID(),
      title: validated.title,
      date: validated.date,
      duration: validated.duration,
      type: validated.type,
      status: 'pendente' as const,
      transcription: validated.transcription,
      summary: validated.summary,
      topics: validated.topics ? JSON.stringify(validated.topics) : null,
      participants: validated.participants ? JSON.stringify(validated.participants) : null,
      tags: validated.tags ? JSON.stringify(validated.tags) : null,
      source: validated.source,
      sourceFileId: validated.sourceFileId,
    };

    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write
    // pelo id que geramos acima.
    await db.insert(conversations).values(newConversation);

    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, newConversation.id))
      .limit(1);

    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] POST /api/conversations error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
