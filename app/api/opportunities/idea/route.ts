import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { pool } from '@/lib/db';
import { anthropic, DEFAULT_MODEL, isAiConfigured, isRateLimitError } from '@/lib/ai/client';
import {
  OPPORTUNITY_IDEA_SYSTEM_PROMPT,
  createIdeaPrompt,
} from '@/lib/ai/prompts/opportunity-idea';

interface IdeaRow {
  id: string;
  title: string;
  pain: string;
  context: string | null;
  type: string;
  subtype: string | null;
  generated_idea: string | null;
  conversation_title: string | null;
}

// Gera (ou devolve do cache) a ideia da oportunidade — proposta redigida pela
// IA a partir de pain+context. Idempotente: a primeira geração é persistida em
// app_opportunities.generated_idea e as chamadas seguintes retornam o cache.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === 'string' && body.id ? body.id : null;
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const res = await pool.query<IdeaRow>(
      `SELECT o.id, o.title, o.pain, o.context, o.type, o.subtype, o.generated_idea,
              c.title AS conversation_title
         FROM app_opportunities o
         LEFT JOIN conversations c ON c.id = o.conversation_id
        WHERE o.id = $1`,
      [id]
    );
    const opp = res.rows[0];
    if (!opp) return NextResponse.json({ error: 'Oportunidade não encontrada' }, { status: 404 });
    if (opp.generated_idea) {
      return NextResponse.json({ data: { idea: opp.generated_idea, cached: true } });
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'IA não configurada no servidor.' }, { status: 503 });
    }

    const { text } = await generateText({
      model: anthropic(DEFAULT_MODEL),
      system: OPPORTUNITY_IDEA_SYSTEM_PROMPT,
      prompt: createIdeaPrompt({
        title: opp.title,
        pain: opp.pain,
        context: opp.context,
        type: opp.type,
        subtype: opp.subtype,
        conversationTitle: opp.conversation_title,
      }),
      maxRetries: 1,
    });
    const idea = text.trim();
    if (!idea) return NextResponse.json({ error: 'A IA retornou resposta vazia.' }, { status: 502 });

    // COALESCE protege contra corrida: se outra requisição persistiu primeiro,
    // a dela vence e devolvemos o que ficou gravado.
    const saved = await pool.query<{ generated_idea: string }>(
      `UPDATE app_opportunities
          SET generated_idea = COALESCE(generated_idea, $1)
        WHERE id = $2
        RETURNING generated_idea`,
      [idea, id]
    );
    return NextResponse.json({
      data: { idea: saved.rows[0]?.generated_idea ?? idea, cached: false },
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: 'Cota de IA esgotada no momento (limite por minuto). Tente novamente em instantes.' },
        { status: 429 }
      );
    }
    console.error('Error generating opportunity idea:', error);
    return NextResponse.json({ error: 'Falha ao gerar a ideia.' }, { status: 500 });
  }
}
