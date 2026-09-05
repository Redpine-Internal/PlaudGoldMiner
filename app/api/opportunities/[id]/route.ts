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
  context: string | null;
  score: number;
  type: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await pool.query<AppOpportunityRow>(
      `SELECT id, conversation_id, title, pain, context, score, type, status, notes, created_at
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
        context: r.context,
        score: r.score,
        type: r.type,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
        conversationId: r.conversation_id,
      }))
    );
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunity' }, { status: 500 });
  }
}

/** Prioridade marcada à mão. null limpa a marca. */
const PRIORITIES = ['alta', 'media', 'baixa'] as const;

/**
 * Só a prioridade é editável.
 *
 * O texto do negócio vem da IA e é rastreável até a conversa de origem; deixar
 * o usuário editá-lo quebraria essa correspondência. A prioridade é a única
 * coisa que ele decide, e não veio de conversa nenhuma.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { priority?: unknown };

    if (!('priority' in body)) {
      return NextResponse.json(
        { error: 'Apenas o campo priority é editável.' },
        { status: 400 }
      );
    }

    const raw = body.priority;
    const priority =
      raw === null || raw === '' ? null
      : typeof raw === 'string' && (PRIORITIES as readonly string[]).includes(raw) ? raw
      : undefined;

    if (priority === undefined) {
      return NextResponse.json(
        { error: `A prioridade deve ser ${PRIORITIES.join(', ')} ou nula.` },
        { status: 400 }
      );
    }

    const res = await pool.query(
      `UPDATE app_opportunities SET priority = $1 WHERE id = $2`,
      [priority, id]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { id, priority } });
  } catch (error) {
    console.error('Error updating opportunity priority:', error);
    return NextResponse.json({ error: 'Falha ao marcar a prioridade' }, { status: 500 });
  }
}

/**
 * Exclui um Novo Negócio e suas fontes.
 *
 * app_opportunity_sources NÃO tem foreign key para app_opportunities, então o
 * banco não faz cascade: apagar só a oportunidade deixaria as fontes órfãs.
 * As remoções e a retirada dos favoritos vão na mesma transação. O enrichment
 * permanece guardado com suas notas e referências, apenas sem a marca de interesse.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { id } = await params;

    await client.query('BEGIN');
    await client.query(`DELETE FROM app_opportunity_sources WHERE opportunity_id = $1`, [id]);
    const res = await client.query(`DELETE FROM app_opportunities WHERE id = $1`, [id]);
    await client.query(
      `UPDATE app_idea_enrichment SET interesting = false
       WHERE source_type = 'opportunity' AND source_id = $1`,
      [id]
    );
    await client.query('COMMIT');

    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error deleting opportunity:', error);
    return NextResponse.json({ error: 'Falha ao excluir o novo negócio' }, { status: 500 });
  } finally {
    client.release();
  }
}
