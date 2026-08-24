import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  conversationUpdateSchema,
  formatZodError,
} from '@/lib/validators/conversation';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/conversations/[id] - Get a specific conversation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (result.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return Response.json({ data: result[0] });
  } catch (error) {
    console.error('[API] GET /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/conversations/[id] - Update a conversation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = conversationUpdateSchema.parse(body);

    // Check if conversation exists
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (existing.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Prepare update data (only include non-undefined fields).
    // updated_at é setado pelo trigger INSTEAD OF da view (now()).
    const updateData: Record<string, unknown> = {};

    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.date !== undefined) updateData.date = validated.date;
    if (validated.duration !== undefined) updateData.duration = validated.duration;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.transcription !== undefined) updateData.transcription = validated.transcription;
    if (validated.summary !== undefined) updateData.summary = validated.summary;
    if (validated.topics !== undefined) updateData.topics = JSON.stringify(validated.topics);
    if (validated.participants !== undefined) updateData.participants = JSON.stringify(validated.participants);
    if (validated.tags !== undefined) updateData.tags = JSON.stringify(validated.tags);

    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write.
    await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, id));

    const [updated] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] PATCH /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/conversations/[id] - Delete a conversation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if conversation exists
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (existing.length === 0) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await db
      .delete(conversations)
      .where(eq(conversations.id, id));

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('[API] DELETE /api/conversations/[id] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
