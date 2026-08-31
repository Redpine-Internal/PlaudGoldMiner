import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Conversas que originaram a oportunidade, com o trecho da transcrição que
// serve de justificativa. Lê app_opportunity_sources (N fontes por
// oportunidade) e traz título/data da conversa para exibição no modal.
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
              s.conversation_id,
              s.excerpt,
              c.title            AS conversation_title,
              c.date::text       AS conversation_date
         FROM app_opportunity_sources s
         LEFT JOIN conversations c ON c.id::text = s.conversation_id
        WHERE s.opportunity_id = $1
        ORDER BY c.date DESC NULLS LAST, s.created_at ASC`,
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
    console.error('Error fetching opportunity sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunity sources' },
      { status: 500 }
    );
  }
}
