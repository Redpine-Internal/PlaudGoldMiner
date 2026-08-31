import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { lerProcedencia } from '@/lib/ai/excerpt-provenance';

// Conversas que originaram a oportunidade, com o trecho que serve de
// justificativa. Lê app_opportunity_sources (N fontes por oportunidade) e traz
// título/data da conversa para exibição no modal.
//
// O trecho nem sempre é fala: quando a análise roda sobre resumos e não se acha
// a passagem equivalente na transcrição, o que sobra é paráfrase da IA. A
// procedência vem marcada no próprio texto e é separada aqui, para o modal
// citar só o que foi realmente dito.
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
      data: res.rows.map((r) => {
        const { texto, daTranscricao } = lerProcedencia(r.excerpt);
        return {
          id: r.id,
          conversationId: r.conversation_id,
          conversationTitle: r.conversation_title,
          conversationDate: r.conversation_date,
          excerpt: texto,
          fromTranscription: daTranscricao,
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching opportunity sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunity sources' },
      { status: 500 }
    );
  }
}
