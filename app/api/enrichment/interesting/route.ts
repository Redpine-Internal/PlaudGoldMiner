import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface InterestingRow {
  enrichmentId: string;
  sourceType: string;
  sourceId: string;
  notes: string | null;
  textOverride: string | null;
  updatedAt: string;
  refCount: number;
  title: string | null;
  subtitle: string | null;
}

/**
 * Agrega ideias marcadas como interessantes, já juntando o título/subtítulo da
 * ideia de origem (SELECT de leitura — permitido). LEFT JOIN por tipo: cada
 * enrichment casa com no máximo uma das duas tabelas, pelo source_id.
 */
export async function GET() {
  try {
    const { rows } = await pool.query<InterestingRow>(
      `SELECT
         e.id            AS "enrichmentId",
         e.source_type   AS "sourceType",
         e.source_id     AS "sourceId",
         e.notes         AS "notes",
         e.text_override AS "textOverride",
         e.updated_at    AS "updatedAt",
         COALESCE(rc.n, 0)::int AS "refCount",
         COALESCE(o.title, c.title) AS "title",
         COALESCE(o.pain, c.theme) AS "subtitle"
       FROM app_idea_enrichment e
       LEFT JOIN app_opportunities o ON e.source_type = 'opportunity' AND o.id = e.source_id
       LEFT JOIN app_contents c ON e.source_type = 'content' AND c.id = e.source_id
       LEFT JOIN (
         SELECT enrichment_id, COUNT(*) AS n
         FROM app_idea_enrichment_reference GROUP BY enrichment_id
       ) rc ON rc.enrichment_id = e.id
       WHERE e.interesting = true
       ORDER BY e.updated_at DESC`
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Error listing interesting:', error);
    return NextResponse.json({ error: 'Failed to list interesting' }, { status: 500 });
  }
}
