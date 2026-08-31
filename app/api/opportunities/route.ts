import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Linha de app_opportunities (tabela local; 1 linha por oportunidade).
// Casa 1:1 com OpportunityCard — sem achatamento jsonb.
interface AppOpportunityRow {
  id: string;
  conversation_id: string | null;
  title: string;
  pain: string;
  context: string | null;
  score: number;
  type: string;
  subtype: string | null;
  generated_idea: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  /** Quantas conversas sustentam a oportunidade — a recorrência é o critério. */
  source_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const filters: string[] = [];
    const values: string[] = [];

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    if (type) {
      values.push(type);
      filters.push(`type = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [res, count] = await Promise.all([
      pool.query<AppOpportunityRow>(
      `SELECT id, conversation_id, title, pain, context, score, type, subtype, generated_idea, status, notes, created_at,
              (SELECT count(*)::int FROM app_opportunity_sources s WHERE s.opportunity_id = app_opportunities.id) AS source_count
         FROM app_opportunities
        ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1}`,
      [...values, limit]
      ),
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM app_opportunities ${where}`, values),
    ]);

    const cards = await enrichWithConversation(
      res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        pain: r.pain,
        context: r.context,
        score: r.score,
        type: r.type,
        subtype: r.subtype ?? null,
        generatedIdea: r.generated_idea,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
        conversationId: r.conversation_id,
        sourceCount: r.source_count,
      }))
    );

    return NextResponse.json({ data: cards, total: Number(count.rows[0].total) });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
