import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapArticleInsights, type ArticleInsightRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await pool.query<ArticleInsightRow>(
      `SELECT id, meeting_ids, title, abstract_text, focus_area, created_at
         FROM article_insights WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation(mapArticleInsights(res.rows));
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching insight:', error);
    return NextResponse.json({ error: 'Failed to fetch insight' }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Edição desabilitada nesta fase (dados read-only do n8n)' },
    { status: 405 }
  );
}
