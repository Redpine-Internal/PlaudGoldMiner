import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['sugerido', 'producao', 'publicado', 'descartado']).optional(),
  notes: z.string().optional(),
  outline: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db
      .select()
      .from(contents)
      .where(eq(contents.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result[0] });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content' },
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
      .update(contents)
      .set(validated)
      .where(eq(contents.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating content:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    );
  }
}
