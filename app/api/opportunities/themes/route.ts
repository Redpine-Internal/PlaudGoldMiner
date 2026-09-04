import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { groupBusinessThemes, type ThemeCandidate } from '@/lib/ai/services/business-theme-grouper';

/**
 * Temas de negócio: o agrupamento que transforma 20 cards em ~5 decisões.
 *
 * GET  lê o cache (app_business_themes + app_business_theme_members) e diz se
 *      ele está desatualizado. Nunca chama a IA — abrir a página não pode
 *      gastar cota da Azure.
 * POST regera o agrupamento com uma chamada de IA e substitui o cache.
 */

interface ThemeRow {
  id: string;
  name: string;
  rationale: string | null;
  updated_at: string;
  opportunity_ids: string[];
  conversation_count: number;
  conversation_titles: string[];
}

export interface ThemeDTO {
  id: string;
  name: string;
  rationale: string | null;
  updatedAt: string;
  opportunityIds: string[];
  /** Conversas distintas que sustentam o tema — a recorrência real. */
  conversationCount: number;
  /** Títulos das conversas, para mostrar de onde o tema vem sem abrir os cards. */
  conversationTitles: string[];
}

const toDTO = (r: ThemeRow): ThemeDTO => ({
  id: r.id,
  name: r.name,
  rationale: r.rationale,
  updatedAt: r.updated_at,
  opportunityIds: r.opportunity_ids,
  conversationCount: r.conversation_count,
  conversationTitles: r.conversation_titles,
});

/**
 * Temas com seus membros, já sem os vínculos que apontam para negócios
 * excluídos — a FK tem ON DELETE CASCADE, mas um tema pode ficar vazio.
 *
 * A contagem de conversas vem por subquery, não por join: juntar as fontes na
 * mesma agregação multiplicaria as linhas e inflaria a contagem de negócios.
 * É a recorrência do tema — quantas conversas distintas falaram do assunto —
 * e é ela, não o número de cards, que diz se vale perseguir.
 */
const SELECT_THEMES = `
  WITH membros AS (
    SELECT m.theme_id, m.opportunity_id, o.score
      FROM app_business_theme_members m
      JOIN app_opportunities o ON o.id = m.opportunity_id
     WHERE o.status IS DISTINCT FROM 'descartada'
  ),
  conversas AS (
    SELECT m.theme_id, c.id AS conversation_id, c.title, c.date
      FROM membros m
      JOIN app_opportunity_sources s ON s.opportunity_id = m.opportunity_id
      JOIN conversations c ON c.id::text = s.conversation_id
     WHERE c.status = 'processado'
     GROUP BY m.theme_id, c.id, c.title, c.date
  )
  SELECT t.id, t.name, t.rationale, t.updated_at::text AS updated_at,
         COALESCE(
           (SELECT array_agg(mb.opportunity_id ORDER BY mb.score DESC NULLS LAST)
              FROM membros mb WHERE mb.theme_id = t.id),
           '{}'
         ) AS opportunity_ids,
         COALESCE((SELECT count(*)::int FROM conversas cv WHERE cv.theme_id = t.id), 0)
           AS conversation_count,
         COALESCE(
           (SELECT array_agg(cv.title ORDER BY cv.date DESC NULLS LAST)
              FROM conversas cv WHERE cv.theme_id = t.id),
           '{}'
         ) AS conversation_titles
    FROM app_business_themes t
   WHERE EXISTS (SELECT 1 FROM membros mb WHERE mb.theme_id = t.id)
   ORDER BY (SELECT count(*) FROM membros mb WHERE mb.theme_id = t.id) DESC, t.name ASC`;

/** Negócios que ainda não caíram em nenhum tema — o motivo de regerar. */
const COUNT_UNGROUPED = `
  SELECT count(*)::int AS n
    FROM app_opportunities o
   WHERE o.status IS DISTINCT FROM 'descartada'
     AND NOT EXISTS (
     SELECT 1 FROM app_business_theme_members m WHERE m.opportunity_id = o.id
   )`;

export async function GET() {
  try {
    const [themes, ungrouped] = await Promise.all([
      pool.query<ThemeRow>(SELECT_THEMES),
      pool.query<{ n: number }>(COUNT_UNGROUPED),
    ]);

    return NextResponse.json({
      data: themes.rows.map(toDTO),
      // A tela usa isto para oferecer "reagrupar" sem que o usuário precise
      // adivinhar que há negócios novos fora dos temas.
      ungrouped: ungrouped.rows[0].n,
    });
  } catch (error) {
    console.error('[API] GET /api/opportunities/themes error:', error);
    return NextResponse.json({ error: 'Falha ao carregar os temas' }, { status: 500 });
  }
}

export async function POST() {
  const client = await pool.connect();
  try {
    const candidates = await client.query<ThemeCandidate>(
      `SELECT id, title, type, subtype
         FROM app_opportunities
        WHERE status IS DISTINCT FROM 'descartada'
        ORDER BY created_at ASC`
    );

    if (!candidates.rowCount) {
      return NextResponse.json({ error: 'Nenhum negócio para agrupar.' }, { status: 400 });
    }

    const result = await groupBusinessThemes(candidates.rows);
    if (!result.success) {
      const status = result.error.code === 'RATE_LIMIT' ? 429
        : result.error.code === 'VALIDATION_ERROR' ? 400
        : 502;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    // Substituição atômica: um agrupamento parcial na tela é pior que o antigo.
    // O DELETE em app_business_themes leva os membros junto pela FK em cascata.
    await client.query('BEGIN');
    await client.query('DELETE FROM app_business_themes');

    for (const theme of result.data) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO app_business_themes (id, name, rationale) VALUES ($1, $2, $3)`,
        [id, theme.name, theme.rationale || null]
      );
      // Um INSERT por tema com unnest: a lista de membros é pequena e assim a
      // transação não vira dezenas de round-trips.
      await client.query(
        `INSERT INTO app_business_theme_members (opportunity_id, theme_id)
         SELECT unnest($1::text[]), $2`,
        [theme.opportunityIds, id]
      );
    }
    await client.query('COMMIT');

    const themes = await client.query<ThemeRow>(SELECT_THEMES);
    return NextResponse.json({
      data: themes.rows.map(toDTO),
      ungrouped: 0,
      message: `${result.data.length} tema(s) a partir de ${candidates.rowCount} negócio(s).`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[API] POST /api/opportunities/themes error:', error);
    return NextResponse.json({ error: 'Falha ao agrupar os negócios' }, { status: 500 });
  } finally {
    client.release();
  }
}
