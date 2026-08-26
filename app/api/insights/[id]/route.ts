import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { CrossInsightCard } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_cross_insights (1 linha por insight).
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
  frequency: number | null;
  analyzed_count: number | null;
  evidence: { conversationId: string; excerpt: string }[] | null;
  business_type: string | null;
  methodology: string | null;
  is_hypothesis: boolean;
  notes: string | null;
}

function toCard(r: AppCrossInsightRow): CrossInsightCard {
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
    frequency: r.frequency,
    analyzedCount: r.analyzed_count,
    evidence: r.evidence ?? [],
    businessType: r.business_type,
    methodology: r.methodology,
    isHypothesis: r.is_hypothesis,
    notes: r.notes,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await pool.query<AppCrossInsightRow>(
      `SELECT id, title, description, pattern, insight_type, confidence,
              status, action_suggestion, conversation_ids, created_at,
              frequency, analyzed_count, evidence, business_type, methodology, is_hypothesis, notes
         FROM app_cross_insights WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation([toCard(res.rows[0])]);
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching insight:', error);
    return NextResponse.json({ error: 'Failed to fetch insight' }, { status: 500 });
  }
}

// Estados que a UI aciona pelos botões do card: útil / dispensar / reativar.
const ALLOWED_STATUS = new Set(['new', 'useful', 'dismissed', 'archived']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (typeof body.status === 'string') {
      if (!ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      values.push(body.status);
      sets.push(`status=$${values.length}`);
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      values.push(body.notes);
      sets.push(`notes=$${values.length}`);
    }
    if (!sets.length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    const res = await pool.query<AppCrossInsightRow>(
      `UPDATE app_cross_insights SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, title, description, pattern, insight_type, confidence,
                 status, action_suggestion, conversation_ids, created_at,
                 frequency, analyzed_count, evidence, business_type, methodology, is_hypothesis, notes`,
      values
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }
    const [card] = await enrichWithConversation([toCard(res.rows[0])]);
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error updating insight:', error);
    return NextResponse.json({ error: 'Failed to update insight' }, { status: 500 });
  }
}
