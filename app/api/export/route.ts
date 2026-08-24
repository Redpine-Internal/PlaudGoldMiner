import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, opportunities, contents, crossInsights } from '@/lib/db/schema';
import { desc, gte, lte, and } from 'drizzle-orm';

interface ExportRequest {
  includeConversations: boolean;
  includeOpportunities: boolean;
  includeContents: boolean;
  includeInsights: boolean;
  includeSummaries: boolean;
  includeTranscriptions: boolean;
  startDate?: string;
  endDate?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequest = await request.json();

    const {
      includeConversations,
      includeOpportunities,
      includeContents,
      includeInsights,
      includeSummaries,
      includeTranscriptions,
      startDate,
      endDate,
    } = body;

    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    // Date filters
    const dateFilters = [];
    if (startDate) {
      dateFilters.push(gte(conversations.date, new Date(startDate)));
    }
    if (endDate) {
      dateFilters.push(lte(conversations.date, new Date(endDate)));
    }

    // Export conversations
    if (includeConversations) {
      const convResult = await db
        .select()
        .from(conversations)
        .where(dateFilters.length > 0 ? and(...dateFilters) : undefined)
        .orderBy(desc(conversations.date));

      exportData.conversations = convResult.map((c) => ({
        id: c.id,
        title: c.title,
        date: c.date,
        duration: c.duration,
        type: c.type,
        status: c.status,
        source: c.source,
        participants: c.participants ? JSON.parse(c.participants) : [],
        topics: c.topics ? JSON.parse(c.topics) : [],
        tags: c.tags ? JSON.parse(c.tags) : [],
        ...(includeSummaries && { summary: c.summary }),
        ...(includeTranscriptions && { transcription: c.transcription }),
      }));
    }

    // Export opportunities
    if (includeOpportunities) {
      const oppResult = await db
        .select()
        .from(opportunities)
        .orderBy(desc(opportunities.createdAt));

      exportData.opportunities = oppResult.map((o) => ({
        id: o.id,
        conversationId: o.conversationId,
        title: o.title,
        pain: o.pain,
        context: o.context,
        score: o.score,
        type: o.type,
        status: o.status,
        notes: o.notes,
        tags: o.tags ? JSON.parse(o.tags) : [],
      }));
    }

    // Export content suggestions
    if (includeContents) {
      const contentResult = await db
        .select()
        .from(contents)
        .orderBy(desc(contents.createdAt));

      exportData.contents = contentResult.map((c) => ({
        id: c.id,
        title: c.title,
        platform: c.platform,
        theme: c.theme,
        outline: c.outline,
        mentionCount: c.mentionCount,
        relevanceScore: c.relevanceScore,
        status: c.status,
        notes: c.notes,
      }));
    }

    // Export cross insights
    if (includeInsights) {
      const insightResult = await db
        .select()
        .from(crossInsights)
        .orderBy(desc(crossInsights.createdAt));

      exportData.insights = insightResult.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        pattern: i.pattern,
        conversationIds: i.conversationIds ? JSON.parse(i.conversationIds) : [],
        insightType: i.insightType,
        confidence: i.confidence,
        status: i.status,
        actionSuggestion: i.actionSuggestion,
      }));
    }

    return NextResponse.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch counts for preview
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Date filters for conversations
    const dateFilters = [];
    if (startDate) {
      dateFilters.push(gte(conversations.date, new Date(startDate)));
    }
    if (endDate) {
      dateFilters.push(lte(conversations.date, new Date(endDate)));
    }

    const [convResult, oppResult, contentResult, insightResult] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(dateFilters.length > 0 ? and(...dateFilters) : undefined),
      db.select().from(opportunities),
      db.select().from(contents),
      db.select().from(crossInsights),
    ]);

    return NextResponse.json({
      counts: {
        conversations: convResult.length,
        opportunities: oppResult.length,
        contents: contentResult.length,
        insights: insightResult.length,
      },
    });
  } catch (error) {
    console.error('Error fetching export counts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch counts' },
      { status: 500 }
    );
  }
}
