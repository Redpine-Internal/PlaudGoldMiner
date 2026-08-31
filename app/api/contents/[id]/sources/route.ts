import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Conversas que originaram a sugestão de conteúdo, com o trecho da transcrição
// que a justifica. Espelha app/api/opportunities/[id]/sources, com duas
// diferenças de schema: aqui conversation_id é uuid (lá é text) e não existe
// created_at, então a ordenação é só por data da conversa.
interface SourceRow {
  id: string;
  conversation_id: string | null;
  excerpt: string | null;
  conversation_title: string | null;
  conversation_date: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const res = await pool.query<SourceRow>(
      `SELECT s.id,
              s.conversation_id::text AS conversation_id,
              s.excerpt,
              c.title            AS conversation_title,
              c.date::text       AS conversation_date
         FROM app_content_sources s
         LEFT JOIN conversations c ON c.id = s.conversation_id
        WHERE s.content_id = $1::text
        ORDER BY c.date DESC NULLS LAST`,
      [id]
    );

    return NextResponse.json({
      data: res.rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        conversationTitle: r.conversation_title,
        conversationDate: r.conversation_date,
        excerpt: r.excerpt,
      })),
    });
  } catch (error) {
    console.error('Error fetching content sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content sources' },
      { status: 500 }
    );
  }
}
