import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { opportunities, conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['nova', 'analise', 'qualificada', 'descartada']).optional(),
  type: z.enum(['produto', 'sistema', 'consultoria', 'servico']).optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        pain: opportunities.pain,
        context: opportunities.context,
        type: opportunities.type,
        status: opportunities.status,
        score: opportunities.score,
        notes: opportunities.notes,
        tags: opportunities.tags,
        conversationId: opportunities.conversationId,
        conversationTitle: conversations.title,
        conversationDate: conversations.date,
        transcription: conversations.transcription,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .leftJoin(conversations, eq(opportunities.conversationId, conversations.id))
      .where(eq(opportunities.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result[0] });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunity' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateSchema.parse(body);

    const [updated] = await db
      .update(opportunities)
      .set(validated)
      .where(eq(opportunities.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating opportunity:', error);

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
      { error: 'Failed to update opportunity' },
      { status: 500 }
    );
  }
}
