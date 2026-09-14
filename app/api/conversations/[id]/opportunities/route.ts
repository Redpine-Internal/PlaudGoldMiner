import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, opportunities } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';
import { isMiningEligibleConversationType } from '@/lib/conversations/classification';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [conversation] = await db
      .select({ type: conversations.type })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conversation || !isMiningEligibleConversationType(conversation.type)) {
      return NextResponse.json({ data: [] });
    }

    const result = await db
      .select()
      .from(opportunities)
      .where(or(
        eq(opportunities.conversationId, id),
        sql`EXISTS (SELECT 1 FROM app_opportunity_sources s WHERE s.opportunity_id::text = ${opportunities.id}::text AND s.conversation_id::text = ${id}::text)`,
      ));

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunities' },
      { status: 500 }
    );
  }
}
