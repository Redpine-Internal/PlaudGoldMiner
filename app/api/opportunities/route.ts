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
  /** 'alta' | 'media' | 'baixa'; null quando não foi priorizada. */
  priority: string | null;
  /** Tema a que o negócio pertence; null enquanto não foi agrupado. */
  theme_id: string | null;
  theme_name: string | null;
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

    // Colunas qualificadas com o alias o: o SELECT junta com as tabelas de tema,
    // e "status" sem prefixo ficaria ambíguo se elas ganharem a mesma coluna.
    if (status) {
      values.push(status);
      filters.push(`o.status = $${values.length}`);
    }
    if (type) {
      values.push(type);
      filters.push(`o.type = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [res, count] = await Promise.all([
      pool.query<AppOpportunityRow>(
      `SELECT o.id, o.conversation_id, o.title, o.pain, o.context, o.score, o.type, o.subtype,
              o.generated_idea, o.status, o.notes, o.created_at, o.priority,
              (SELECT count(*)::int FROM app_opportunity_sources s WHERE s.opportunity_id = o.id) AS source_count,
              m.theme_id, t.name AS theme_name
         FROM app_opportunities o
         LEFT JOIN app_business_theme_members m ON m.opportunity_id = o.id
         LEFT JOIN app_business_themes t ON t.id = m.theme_id
        ${where}
        ORDER BY o.created_at DESC
        LIMIT $${values.length + 1}`,
      [...values, limit]
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM app_opportunities o ${where}`,
        values
      ),
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
        priority: r.priority ?? null,
        themeId: r.theme_id ?? null,
        themeName: r.theme_name ?? null,
      }))
    );

    return NextResponse.json({ data: cards, total: Number(count.rows[0].total) });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
