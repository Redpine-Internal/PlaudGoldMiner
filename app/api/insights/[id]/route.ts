import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crossInsights } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['new', 'useful', 'ignored', 'implemented']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db
      .select()
      .from(crossInsights)
      .where(eq(crossInsights.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result[0] });
  } catch (error) {
    console.error('Error fetching insight:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insight' },
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
      .update(crossInsights)
      .set(validated)
      .where(eq(crossInsights.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating insight:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update insight' },
      { status: 500 }
    );
  }
}
