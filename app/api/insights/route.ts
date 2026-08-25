import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { CrossInsightCard } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_cross_insights (1 linha por insight). conversation_ids é um
// JSON array (text); o 1º id alimenta o enrichWithConversation.
interface AppCrossInsightRow {
  id: string;
  title: string;
  description: string;
  pattern: string;
  insight_type: string;
  confidence: number;
  status: string;
  action_suggestion: string | null;
  conversation_ids: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const res = await pool.query<AppCrossInsightRow>(
      `SELECT id, title, description, pattern, insight_type, confidence,
              status, action_suggestion, conversation_ids, created_at
         FROM app_cross_insights
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );

    const cards = await enrichWithConversation(
      res.rows.map<CrossInsightCard>((r) => {
        let ids: string[] = [];
        try {
          ids = r.conversation_ids ? JSON.parse(r.conversation_ids) : [];
        } catch {
          ids = [];
        }
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          pattern: r.pattern,
          insightType: r.insight_type,
          confidence: r.confidence,
          status: r.status,
          actionSuggestion: r.action_suggestion,
          conversationIds: JSON.stringify(ids),
          conversationId: ids[0] ?? null,
          createdAt: r.created_at,
        };
      })
    );

    let filtered = cards;
    if (status) filtered = filtered.filter((i) => i.status === status);
    if (type) filtered = filtered.filter((i) => i.insightType === type);

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
  }
}
