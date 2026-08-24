import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { mapBusinessOpportunities, type BusinessOpportunityRow } from '@/lib/n8n/mappers';
import { enrichWithConversation } from '@/lib/n8n/enrich';

// id sintético = `${rowId}:${index}`. Estratégia: separar o rowId antes do último ':',
// buscar essa linha e localizar o card cujo id bate exatamente (find). Se o índice não
// existir na linha, o find não acha → 404. Só o formato canônico `uuid:index` é resolvível.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rowId = id.includes(':') ? id.slice(0, id.lastIndexOf(':')) : id;

    const res = await pool.query<BusinessOpportunityRow>(
      `SELECT id, meeting_ids, opportunities, created_at
         FROM business_opportunities WHERE id = $1 LIMIT 1`,
      [rowId]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const cards = await enrichWithConversation(mapBusinessOpportunities(res.rows));
    const card = cards.find((c) => c.id === id);
    if (!card) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }
    return NextResponse.json({ data: card });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunity' }, { status: 500 });
  }
}

// Read-only nesta fase: os dados são gerados pelo agente n8n (sem estado editável).
export async function PATCH() {
  return NextResponse.json(
    { error: 'Edição desabilitada nesta fase (dados read-only do n8n)' },
    { status: 405 }
  );
}
