import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, opportunities, crossInsights } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { analyzeCrossConversations } from '@/lib/ai/services/cross-insight-analyzer';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Get all processed conversations with their opportunities
    const allConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.status, 'processado'))
      .orderBy(desc(conversations.date))
      .limit(20); // Analyze up to 20 most recent conversations

    if (allConversations.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 processed conversations for cross-analysis' },
        { status: 400 }
      );
    }

    // Get opportunities for each conversation
    const conversationsWithData = await Promise.all(
      allConversations.map(async (conv) => {
        const opps = await db
          .select()
          .from(opportunities)
          .where(eq(opportunities.conversationId, conv.id));

        return {
          id: conv.id,
          title: conv.title,
          summary: conv.summary,
          topics: conv.topics ? JSON.parse(conv.topics) : [],
          opportunities: opps.map((o) => ({ title: o.title, pain: o.pain })),
        };
      })
    );

    // Run cross-conversation analysis
    const result = await analyzeCrossConversations(conversationsWithData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    // Save insights to database
    const savedInsights = [];

    // Save patterns as insights
    for (const pattern of result.data.patterns) {
      const [saved] = await db
        .insert(crossInsights)
        .values({
          id: randomUUID(),
          title: pattern.theme,
          description: pattern.description,
          pattern: `Mencionado em ${pattern.frequency} conversas`,
          conversationIds: JSON.stringify(pattern.conversationIds),
          insightType: 'pattern',
          confidence: pattern.significance === 'high' ? 0.9 : pattern.significance === 'medium' ? 0.7 : 0.5,
          status: 'new',
          actionSuggestion: null,
        })
        .returning();
      savedInsights.push(saved);
    }

    // Save connections as insights
    for (const connection of result.data.connections) {
      const [saved] = await db
        .insert(crossInsights)
        .values({
          id: randomUUID(),
          title: connection.title,
          description: connection.explanation,
          pattern: connection.type,
          conversationIds: JSON.stringify(connection.conversationIds),
          insightType: connection.type,
          confidence: connection.relevanceScore / 100,
          status: 'new',
          actionSuggestion: connection.suggestedAction,
        })
        .returning();
      savedInsights.push(saved);
    }

    return NextResponse.json({
      data: savedInsights,
      summary: {
        patterns: result.data.patterns.length,
        connections: result.data.connections.length,
        conversationsAnalyzed: conversationsWithData.length,
      },
    });
  } catch (error) {
    console.error('Error analyzing cross-insights:', error);
    return NextResponse.json(
      { error: 'Failed to analyze cross-conversation insights' },
      { status: 500 }
    );
  }
}
