import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { opportunities, conversations } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Join opportunities with conversations to get source info
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
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .leftJoin(conversations, eq(opportunities.conversationId, conversations.id))
      .orderBy(desc(opportunities.createdAt))
      .limit(limit);

    // Apply filters client-side for simplicity (can optimize to SQL later)
    let filtered = result;
    if (status) {
      filtered = filtered.filter((o) => o.status === status);
    }
    if (type) {
      filtered = filtered.filter((o) => o.type === type);
    }

    return NextResponse.json({
      data: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunities' },
      { status: 500 }
    );
  }
}
