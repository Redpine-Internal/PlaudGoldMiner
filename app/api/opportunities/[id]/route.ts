import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// Fonte local: app_opportunities tem 1 linha por oportunidade, então o id da URL
// é o id real da linha (sem parsing sintético). Lookup direto por id.
interface AppOpportunityRow {
  id: string;
  conversation_id: string | null;
  title: string;
  pain: string;
  score: number;
  type: string;
  status: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await pool.query<AppOpportunityRow>(
      `SELECT id, conversation_id, title, pain, score, type, status
         FROM app_opportunities WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const [card] = await enrichWithConversation(
      res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        pain: r.pain,
        score: r.score,
        type: r.type,
        status: r.status,
        conversationId: r.conversation_id,
      }))
    );
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunity' }, { status: 500 });
  }
}

// Edição desabilitada nesta fase: a UI não expõe edição de oportunidade.
export async function PATCH() {
  return NextResponse.json(
    { error: 'Edição de oportunidade desabilitada nesta fase' },
    { status: 405 }
  );
}
