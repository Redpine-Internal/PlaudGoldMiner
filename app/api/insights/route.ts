import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapArticleInsights, type ArticleInsightRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const res = await pool.query<ArticleInsightRow>(
      `SELECT id, meeting_ids, title, abstract_text, focus_area, created_at
         FROM article_insights
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const cards = await enrichWithConversation(mapArticleInsights(res.rows));

    let filtered = cards;
    if (status) filtered = filtered.filter((i) => i.status === status);
    if (type) filtered = filtered.filter((i) => i.insightType === type);

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
  }
}
