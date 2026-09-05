import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { enrichWithConversation } from '@/lib/n8n/enrich';
import { collectionPagination, collectionSearch, collectionValues, foldedSearchSql, statusCounts } from '@/lib/collection-query';

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
    const { limit, offset } = collectionPagination(searchParams);
    const status = searchParams.get('status');
    const types = collectionValues(searchParams, 'type');
    const filters: string[] = [];
    const values: unknown[] = [];

    // Colunas qualificadas com o alias o: o SELECT junta com as tabelas de tema,
    // e "status" sem prefixo ficaria ambíguo se elas ganharem a mesma coluna.
    if (types.length) {
      values.push(types);
      filters.push(`o.type = ANY($${values.length}::text[])`);
    }
    const search = searchParams.get('search')?.trim();
    if (search) {
      values.push(collectionSearch(search));
      filters.push(`(${foldedSearchSql('o.title')} LIKE $${values.length} OR ${foldedSearchSql('o.pain')} LIKE $${values.length})`);
    }
    const minScore = Number(searchParams.get('minScore') ?? 0);
    if (Number.isFinite(minScore) && minScore > 0) {
      values.push(minScore);
      filters.push(`o.score >= $${values.length}`);
    }
    if (searchParams.get('interesting') === 'true') {
      filters.push("EXISTS (SELECT 1 FROM app_idea_enrichment e WHERE e.source_type = 'opportunity' AND e.source_id::text = o.id::text AND e.interesting = true)");
    }
    const baseWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const baseValues = [...values];
    if (status) {
      values.push(status);
      filters.push(`o.status = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [res, count, counts] = await Promise.all([
      pool.query<AppOpportunityRow>(
      `SELECT o.id, o.conversation_id, o.title, o.pain, o.context, o.score, o.type, o.subtype,
              o.generated_idea, o.status, o.notes, o.created_at, o.priority,
              (SELECT count(*)::int FROM app_opportunity_sources s WHERE s.opportunity_id = o.id) AS source_count,
              m.theme_id, t.name AS theme_name
         FROM app_opportunities o
         LEFT JOIN app_business_theme_members m ON m.opportunity_id = o.id
         LEFT JOIN app_business_themes t ON t.id = m.theme_id
        ${where}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM app_opportunities o ${where}`,
        values
      ),
      pool.query<{ status: string; total: string }>(`SELECT o.status, COUNT(*) AS total FROM app_opportunities o ${baseWhere} GROUP BY o.status`, baseValues),
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

    return NextResponse.json({ data: cards, total: Number(count.rows[0]?.total ?? 0), counts: statusCounts(counts.rows), limit, offset });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}
