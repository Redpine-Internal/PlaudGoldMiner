import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, opportunities, contents, contentSources } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateContentSuggestions } from '@/lib/ai/services/content-suggestion-generator';
import { randomUUID } from 'crypto';

/**
 * Generate content-piece suggestions from recurring themes across processed
 * conversations, persisting them into `contents` (+ `content_sources` for
 * traceability). Mirrors POST /api/insights/analyze.
 */
export async function POST() {
  try {
    const processed = await db
      .select()
      .from(conversations)
      .where(eq(conversations.status, 'processado'))
      .orderBy(desc(conversations.date))
      .limit(20);

    if (processed.length < 2) {
      return NextResponse.json(
        { error: 'São necessárias ao menos 2 conversas processadas para sugerir conteúdos.' },
        { status: 400 }
      );
    }

    // Attach each conversation's opportunities (the raw material for content
    // themes). Problems aren't persisted as a table, but each opportunity's
    // `pain` already captures the underlying dor, so it doubles as the problem
    // signal here.
    const enriched = await Promise.all(
      processed.map(async (conv) => {
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
          // Derive problem signals from opportunity pains (no separate table).
          problems: opps
            .filter((o) => o.pain)
            .map((o) => ({ description: o.pain, severity: o.score >= 70 ? 'alta' : 'media' })),
        };
      })
    );

    const result = await generateContentSuggestions(enriched);

    if (!result.success) {
      const rateLimited = result.error.code === 'RATE_LIMIT';
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: rateLimited ? 429 : 500 }
      );
    }

    const validIds = new Set(processed.map((c) => c.id));
    const saved = [];

    for (const s of result.data.suggestions) {
      const contentId = randomUUID();
      const [created] = await db
        .insert(contents)
        .values({
          id: contentId,
          title: s.title,
          platform: s.platform,
          theme: s.theme,
          // Store the outline (+ angle) as structured JSON, as the schema intends.
          outline: JSON.stringify({ angle: s.angle, points: s.outline }),
          mentionCount: Math.max(1, s.mentionCount),
          relevanceScore: s.relevanceScore,
          status: 'sugerido',
        })
        .returning();

      // Persist source excerpts for traceability (skip refs to unknown convs).
      for (const src of s.sourceExcerpts) {
        if (!validIds.has(src.conversationId)) continue;
        await db.insert(contentSources).values({
          id: randomUUID(),
          contentId,
          conversationId: src.conversationId,
          excerpt: src.excerpt,
        });
      }
      saved.push(created);
    }

    return NextResponse.json({
      data: saved,
      summary: {
        suggestions: saved.length,
        conversationsAnalyzed: enriched.length,
      },
    });
  } catch (error) {
    console.error('Error generating content suggestions:', error);
    return NextResponse.json({ error: 'Failed to generate content suggestions' }, { status: 500 });
  }
}
