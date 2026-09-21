import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { groupBusinessThemes, type ThemeCandidate } from '@/lib/ai/services/business-theme-grouper';
import { miningEligibleSql, opportunityHasEligibleSourceSql } from '@/lib/conversations/classification';

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
  status: string;
  notes: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  updated_at: string;
  opportunity_ids: string[];
  conversation_count: number;
  conversation_titles: string[];
}

export interface ThemeDTO {
  id: string;
  name: string;
  rationale: string | null;
  /** Decisão do operador sobre o tema: ativo | priorizado | arquivado. */
  status: string;
  /** Anotação do operador. Sobrevive ao reagrupamento. */
  notes: string | null;
  /** Conversa mais antiga do tema — desde quando o assunto aparece. */
  firstSeenAt: string | null;
  /** Conversa mais recente — responde "está esfriando?". */
  lastSeenAt: string | null;
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
  status: r.status,
  notes: r.notes,
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
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
       AND ${opportunityHasEligibleSourceSql('o')}
  ),
  conversas AS (
    SELECT m.theme_id, c.id AS conversation_id, c.title, c.date
      FROM membros m
      JOIN app_opportunity_sources s ON s.opportunity_id = m.opportunity_id
      JOIN conversations c ON c.id::text = s.conversation_id
     WHERE c.status = 'processado'
       AND ${miningEligibleSql('c.type')}
     GROUP BY m.theme_id, c.id, c.title, c.date
  )
  SELECT t.id, t.name, t.rationale, t.status, t.notes,
         t.first_seen_at::text AS first_seen_at,
         t.last_seen_at::text  AS last_seen_at,
         t.updated_at::text AS updated_at,
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
     AND t.status <> 'arquivado'
   -- Priorizado primeiro (é decisão do operador, vale mais que qualquer
   -- métrica), depois a recorrência real: conversas distintas, não número de
   -- cards. Um tema com 34 conversas e 2 negócios pesa mais que um com 5
   -- negócios e 3 conversas.
   ORDER BY (t.status = 'priorizado') DESC,
            (SELECT count(*) FROM conversas cv WHERE cv.theme_id = t.id) DESC,
            (SELECT count(*) FROM membros mb WHERE mb.theme_id = t.id) DESC,
            t.name ASC`;

/** Negócios que ainda não caíram em nenhum tema — o motivo de regerar. */
const COUNT_UNGROUPED = `
  SELECT count(*)::int AS n
    FROM app_opportunities o
   WHERE o.status IS DISTINCT FROM 'descartada'
     AND ${opportunityHasEligibleSourceSql('o')}
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
      `SELECT o.id, o.title, o.type, o.subtype
         FROM app_opportunities o
        WHERE o.status IS DISTINCT FROM 'descartada'
          AND ${opportunityHasEligibleSourceSql('o')}
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

    // O tema é PERMANENTE. Antes isto fazia `DELETE FROM app_business_themes` e
    // recriava tudo com ids novos, o que destruía a identidade do tema a cada
    // reagrupamento: a prioridade marcada, a nota escrita e a data em que o
    // assunto apareceu pela primeira vez sumiam junto. UPSERT por `slug`
    // preserva tudo isso e ainda deixa o tema acumular — uma reunião nova sobre
    // terceiros fortalece o tema que existe em vez de criar outro.
    await client.query('BEGIN');

    // Os vínculos são recalculados (um negócio pode mudar de tema), mas os
    // temas em si sobrevivem.
    await client.query('DELETE FROM app_business_theme_members');

    for (const theme of result.data) {
      const slug = theme.name.trim().toLowerCase().replace(/\s+/g, ' ');
      const upserted = await client.query<{ id: string }>(
        `INSERT INTO app_business_themes (id, name, slug, rationale, updated_at)
              VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (slug) DO UPDATE
            SET name = EXCLUDED.name,
                -- O modelo reescreve o rationale a cada rodada; o texto mais
                -- recente é o que reflete os negócios atuais do tema.
                rationale = COALESCE(EXCLUDED.rationale, app_business_themes.rationale),
                updated_at = now()
         RETURNING id`,
        [crypto.randomUUID(), theme.name, slug, theme.rationale || null]
      );
      // O RETURNING de um upsert pode vir vazio (escrita concorrente na mesma
      // slug); nesse caso o tema existe, então busca o id em vez de estourar e
      // abortar o reagrupamento inteiro.
      const id =
        upserted.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `SELECT id FROM app_business_themes WHERE slug = $1`,
            [slug]
          )
        ).rows[0]?.id;
      if (!id) {
        throw new Error(`Falha ao resolver o tema "${theme.name}" (slug: ${slug}).`);
      }

      // Um INSERT por tema com unnest: a lista de membros é pequena e assim a
      // transação não vira dezenas de round-trips.
      await client.query(
        `INSERT INTO app_business_theme_members (opportunity_id, theme_id)
         SELECT unnest($1::text[]), $2`,
        [theme.opportunityIds, id]
      );
    }

    // Datas derivadas das conversas que sustentam cada tema — é o que responde
    // "está crescendo ou esfriando?". Recalculado aqui porque os vínculos
    // acabaram de mudar. `first_seen_at` nunca retrocede para depois do que já
    // estava: a história do tema não se apaga quando um negócio sai dele.
    await client.query(
      `WITH janela AS (
         SELECT m.theme_id, min(c.date) AS primeira, max(c.date) AS ultima
           FROM app_business_theme_members m
           JOIN app_opportunity_sources s ON s.opportunity_id = m.opportunity_id
           JOIN conversations c ON c.id::text = s.conversation_id::text
          GROUP BY m.theme_id
       )
       UPDATE app_business_themes t
          SET first_seen_at = LEAST(COALESCE(t.first_seen_at, j.primeira), j.primeira),
              last_seen_at  = GREATEST(COALESCE(t.last_seen_at, j.ultima), j.ultima)
         FROM janela j
        WHERE j.theme_id = t.id`
    );

    // Tema que ficou sem nenhum negócio: o assunto não aparece mais no acervo.
    // Arquiva em vez de apagar — o operador pode ter anotado algo nele, e um
    // tema que some sem rastro é pior que um tema fora da tela principal.
    await client.query(
      `UPDATE app_business_themes t
          SET status = 'arquivado', updated_at = now()
        WHERE t.status <> 'arquivado'
          AND NOT EXISTS (
            SELECT 1 FROM app_business_theme_members m WHERE m.theme_id = t.id
          )`
    );

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
