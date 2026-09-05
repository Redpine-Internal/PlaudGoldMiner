import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { profileFirstName } from '@/lib/profile/default-profile';

// GET /api/dashboard - Agregado do Dashboard "Resumo".
// "conversations" é uma VIEW; somente leitura aqui (nunca .returning()).

interface ConversationRow {
  id: string;
  title: string;
  date: Date | string | null;
}

interface PipelineRow {
  id: string;
  title: string;
  status: string;
  score: number | null;
}

interface BusinessThemeRow {
  name: string;
  rationale: string | null;
  updated_at: string;
  opportunities: number;
  conversations: number;
}

interface ThemeCoverageRow {
  total: number;
  mapped: number;
  updated_at: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
}

// Demanda agregada por tipo de negócio. "conversations" aqui é o nº de conversas
// distintas que sustentam aquele tipo — é o que mede demanda real, não a
// quantidade de cards (uma oportunidade de 8 conversas pesa mais que 3 de duas).
const DEMAND_LABEL: Record<string, string> = {
  treinamento: 'Treinamento',
  consultoria: 'Consultoria',
  sistema: 'Sistema',
  produto: 'Produto',
};

interface DemandRow {
  type: string;
  count: number;
  conversations: number;
  avg_score: number | null;
  top_title: string | null;
}

// Volume de conversas por mês — a matéria-prima da análise ao longo do tempo.
interface VolumeRow {
  month: string;
  total: number;
}

// Quantas conversas sustentam cada negócio. É a distribuição que prova que as
// oportunidades passaram a nascer de um conjunto, não de uma reunião isolada.
interface EvidenceRow {
  sources: number;
  opportunities: number;
}

interface WeekActivityRow {
  conversations: number;
  opportunities: number;
  source_conversations: number;
  recent_source_conversations: number;
  suggested_contents: number;
  top_type: string | null;
  top_type_count: number;
}

const MONTH_ABBR = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export async function GET() {
  try {
    const [
      processedRes,
      opportunitiesRes,
      pendingRes,
      suggestedRes,
      weekActivityRes,
      recentRes,
      pipelineRes,
      themesRes,
      themeCoverageRes,
      lastProjectRes,
      profileRes,
      demandRes,
      volumeRes,
      evidenceRes,
      coverageRes,
    ] = await Promise.all([
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations WHERE status = 'processado'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_opportunities
          WHERE status IS DISTINCT FROM 'descartada'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations WHERE status = 'pendente'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_contents WHERE status = 'sugerido'`
      ),
      pool.query<WeekActivityRow>(
        `WITH weekly_opportunities AS (
           SELECT id, type
             FROM app_opportunities
            WHERE status IS DISTINCT FROM 'descartada'
              AND created_at >= now() - interval '7 days'
         ), top_type AS (
           SELECT type, COUNT(*)::int AS count
             FROM weekly_opportunities
            GROUP BY type
            ORDER BY count DESC, type
            LIMIT 1
         ), weekly_sources AS (
           SELECT s.conversation_id, c.date
             FROM weekly_opportunities o
             JOIN app_opportunity_sources s ON s.opportunity_id = o.id
             JOIN conversations c
               ON c.id::text = s.conversation_id
              AND c.status = 'processado'
            GROUP BY s.conversation_id, c.date
         )
         SELECT (SELECT COUNT(*)::int FROM conversations
                  WHERE status = 'processado'
                    AND date BETWEEN current_date - interval '6 days' AND current_date) AS conversations,
                (SELECT COUNT(*)::int FROM weekly_opportunities) AS opportunities,
                (SELECT COUNT(*)::int FROM weekly_sources) AS source_conversations,
                (SELECT COUNT(*)::int FROM weekly_sources
                  WHERE date BETWEEN current_date - interval '6 days' AND current_date)
                  AS recent_source_conversations,
                (SELECT COUNT(*)::int FROM app_contents
                  WHERE status = 'sugerido'
                    AND created_at >= now() - interval '7 days') AS suggested_contents,
                (SELECT type FROM top_type) AS top_type,
                COALESCE((SELECT count FROM top_type), 0)::int AS top_type_count`
      ),
      pool.query<ConversationRow>(
        `SELECT COALESCE(NULLIF(source_file_id, ''), id::text) AS id, title, date
           FROM conversations
          WHERE status = 'processado'
          ORDER BY date DESC NULLS LAST
          LIMIT 4`
      ),
      pool.query<PipelineRow>(
        `SELECT id, title, status, score FROM app_opportunities
          WHERE status IS DISTINCT FROM 'descartada'
          ORDER BY score DESC NULLS LAST
          LIMIT 4`
      ),
      // Temas são uma leitura semântica da IA sobre os negócios, não palavras
      // soltas extraídas de reuniões. O resultado é cacheado para abrir o
      // dashboard sem custo nem latência de modelo.
      pool.query<BusinessThemeRow>(
        `WITH active_members AS (
           SELECT m.theme_id, m.opportunity_id
             FROM app_business_theme_members m
             JOIN app_opportunities o ON o.id = m.opportunity_id
            WHERE o.status IS DISTINCT FROM 'descartada'
         ), theme_conversations AS (
           SELECT m.theme_id, s.conversation_id
             FROM active_members m
             JOIN app_opportunity_sources s ON s.opportunity_id = m.opportunity_id
             JOIN conversations c
               ON c.id::text = s.conversation_id
              AND c.status = 'processado'
            GROUP BY m.theme_id, s.conversation_id
         )
         SELECT t.name,
                t.rationale,
                t.updated_at::text AS updated_at,
                (SELECT COUNT(*)::int FROM active_members m WHERE m.theme_id = t.id)
                  AS opportunities,
                (SELECT COUNT(*)::int FROM theme_conversations c WHERE c.theme_id = t.id)
                  AS conversations
           FROM app_business_themes t
          WHERE EXISTS (SELECT 1 FROM active_members m WHERE m.theme_id = t.id)
          ORDER BY conversations DESC, opportunities DESC, t.name
          LIMIT 4`
      ),
      pool.query<ThemeCoverageRow>(
        `WITH active_opportunities AS (
           SELECT id
             FROM app_opportunities
            WHERE status IS DISTINCT FROM 'descartada'
         )
         SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1
                    FROM app_business_theme_members m
                   WHERE m.opportunity_id = o.id
                ))::int AS mapped,
                (SELECT MAX(t.updated_at)::text
                   FROM app_business_themes t
                   JOIN app_business_theme_members m ON m.theme_id = t.id
                   JOIN active_opportunities a ON a.id = m.opportunity_id) AS updated_at
           FROM active_opportunities o`
      ),
      pool.query<ProjectRow>(
        `SELECT id, title, description FROM app_projects
          WHERE status = 'ativo'
          ORDER BY created_at DESC
          LIMIT 1`
      ),
      pool.query<{ name: string | null }>(
        `SELECT name FROM app_user_profile WHERE id = 'default'`
      ),
      // Descartadas ficam de fora: a leitura é "onde há demanda", não "o que a
      // IA já produziu". DISTINCT na conversa porque a mesma reunião costuma
      // alimentar várias oportunidades do mesmo tipo. A média é calculada à
      // parte, antes de multiplicar cada negócio por suas linhas de fontes.
      pool.query<DemandRow>(
        `SELECT o.type,
                COUNT(DISTINCT o.id)::int AS count,
                COUNT(DISTINCT c.id)::int AS conversations,
                (SELECT ROUND(AVG(scored.score))::int FROM app_opportunities scored
                  WHERE scored.type = o.type AND scored.status IS DISTINCT FROM 'descartada') AS avg_score,
                (SELECT t.title FROM app_opportunities t
                  WHERE t.type = o.type AND t.status IS DISTINCT FROM 'descartada'
                  ORDER BY t.score DESC NULLS LAST LIMIT 1) AS top_title
           FROM app_opportunities o
           LEFT JOIN app_opportunity_sources s ON s.opportunity_id = o.id
           LEFT JOIN conversations c
             ON c.id::text = s.conversation_id
            AND c.status = 'processado'
          WHERE o.status IS DISTINCT FROM 'descartada'
          GROUP BY o.type
          ORDER BY conversations DESC, count DESC`
      ),
      // generate_series garante os meses sem conversa: buracos na série temporal
      // precisam aparecer como zero, não sumir e falsear a continuidade.
      pool.query<VolumeRow>(
        `WITH meses AS (
           SELECT generate_series(
             date_trunc('month', now()) - interval '11 months',
             date_trunc('month', now()),
             interval '1 month'
           ) AS m
         )
         SELECT to_char(meses.m, 'YYYY-MM') AS month,
                COUNT(c.id)::int AS total
           FROM meses
           LEFT JOIN conversations c
             ON date_trunc('month', c.date) = meses.m
            AND c.status = 'processado'
          GROUP BY meses.m
          ORDER BY meses.m`
      ),
      pool.query<EvidenceRow>(
        `SELECT n_fontes AS sources, COUNT(*)::int AS opportunities
           FROM (
             SELECT o.id, COUNT(DISTINCT c.id)::int AS n_fontes
               FROM app_opportunities o
               LEFT JOIN app_opportunity_sources s ON s.opportunity_id = o.id
               LEFT JOIN conversations c
                 ON c.id::text = s.conversation_id
                AND c.status = 'processado'
              WHERE o.status IS DISTINCT FROM 'descartada'
              GROUP BY o.id
           ) t
          GROUP BY n_fontes
          ORDER BY n_fontes`
      ),
      // Cobertura: quanto do acervo processado já virou evidência de negócio.
      pool.query<{ linked: number; total: number }>(
        `SELECT (SELECT COUNT(DISTINCT s.conversation_id)::int
                   FROM app_opportunity_sources s
                   INNER JOIN app_opportunities o ON o.id = s.opportunity_id
                   INNER JOIN conversations c
                     ON c.id::text = s.conversation_id
                    AND c.status = 'processado'
                  WHERE o.status IS DISTINCT FROM 'descartada') AS linked,
                (SELECT COUNT(*)::int FROM conversations
                  WHERE status = 'processado') AS total`
      ),
    ]);

    const recentConversations = recentRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      // DATE não deve virar meia-noite UTC no cliente: em fusos negativos isso
      // fazia 02/set aparecer como 01/set.
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : '',
    }));

    const pipeline = pipelineRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      score: row.score ?? 0,
    }));

    const themes = themesRes.rows.map((row) => ({
      name: row.name,
      rationale: row.rationale,
      opportunities: row.opportunities,
      conversations: row.conversations,
    }));

    const themeCoverageRow = themeCoverageRes.rows[0];
    const themeTotal = themeCoverageRow?.total ?? 0;
    const themeMapped = themeCoverageRow?.mapped ?? 0;
    const themeCoverage = {
      total: themeTotal,
      mapped: themeMapped,
      ungrouped: Math.max(themeTotal - themeMapped, 0),
      percent: themeTotal > 0 ? Math.round((themeMapped / themeTotal) * 100) : 0,
      updatedAt: themeCoverageRow?.updated_at ?? null,
    };

    // "Continuar" só pode apontar para trabalho realmente ativo.
    const projectRow: ProjectRow | null = lastProjectRes.rows[0] ?? null;
    const lastProject = projectRow
      ? {
          id: projectRow.id,
          title: projectRow.title,
          description: projectRow.description ?? null,
        }
      : null;

    const linkedConversations = coverageRes.rows[0]?.linked ?? 0;
    const demand = demandRes.rows.map((r) => ({
      type: r.type,
      count: r.count,
      conversations: r.conversations,
      avgScore: r.avg_score ?? 0,
      topTitle: r.top_title ?? null,
      // Alcance sobre conversas únicas vinculadas. Tipos se sobrepõem, então
      // somar as barras não representa 100% — e a API explicita isso.
      reach:
        linkedConversations > 0
          ? Math.round((r.conversations / linkedConversations) * 100)
          : 0,
    }));

    const volume = volumeRes.rows.map((r) => {
      const [year, month] = r.month.split('-');
      return {
        month: r.month,
        label: MONTH_ABBR[Number(month) - 1] ?? r.month,
        year: Number(year),
        total: r.total,
      };
    });
    const volumeMax = volume.reduce((acc, v) => Math.max(acc, v.total), 0);
    const volumeTotal = volume.reduce((acc, v) => acc + v.total, 0);

    const evidenceTotal = evidenceRes.rows.reduce((acc, r) => acc + r.opportunities, 0);
    // Média ponderada de conversas por negócio — o número que resume a virada
    // de "uma reunião gerou um card" para "o conjunto gerou um card".
    const evidenceWeighted = evidenceRes.rows.reduce(
      (acc, r) => acc + r.sources * r.opportunities,
      0
    );
    const evidence = {
      buckets: evidenceRes.rows.map((r) => ({
        sources: r.sources,
        opportunities: r.opportunities,
      })),
      total: evidenceTotal,
      max: evidenceRes.rows.reduce((acc, r) => Math.max(acc, r.opportunities), 0),
      avgSources:
        evidenceTotal > 0
          ? Math.round((evidenceWeighted / evidenceTotal) * 10) / 10
          : 0,
      withoutSources: evidenceRes.rows.find((r) => r.sources === 0)?.opportunities ?? 0,
      single: evidenceRes.rows.find((r) => r.sources === 1)?.opportunities ?? 0,
      sourceLinks: evidenceWeighted,
    };

    const coverageRow = coverageRes.rows[0];
    const coverageTotal = coverageRow?.total ?? 0;
    const coverage = {
      linked: coverageRow?.linked ?? 0,
      total: coverageTotal,
      percent:
        coverageTotal > 0
          ? Math.round(((coverageRow?.linked ?? 0) / coverageTotal) * 100)
          : 0,
    };

    const greetingName = profileFirstName(profileRes.rows[0]?.name);

    const kpis = {
      conversations: processedRes.rows[0]?.count ?? 0,
      opportunities: opportunitiesRes.rows[0]?.count ?? 0,
      contents: suggestedRes.rows[0]?.count ?? 0,
    };

    const queue = {
      pendingConversations: pendingRes.rows[0]?.count ?? 0,
      suggestedContents: suggestedRes.rows[0]?.count ?? 0,
    };

    // Leitura executiva: separa a data do registro feito pela IA da data das
    // conversas usadas como evidência; misturar as duas cria uma falsa ideia
    // de que todos os negócios vieram de reuniões da semana.
    const weekActivity = weekActivityRes.rows[0] ?? {
      conversations: 0,
      opportunities: 0,
      source_conversations: 0,
      recent_source_conversations: 0,
      suggested_contents: 0,
      top_type: null,
      top_type_count: 0,
    };
    const sentences: string[] = [];
    if (weekActivity.conversations > 0) {
      sentences.push(
        weekActivity.conversations === 1
          ? 'Há 1 conversa no acervo com data nos últimos 7 dias.'
          : `Há ${weekActivity.conversations} conversas no acervo com data nos últimos 7 dias.`
      );
    } else if (kpis.conversations > 0) {
      sentences.push('Não há conversa com data dos últimos 7 dias no acervo.');
    }
    if (weekActivity.opportunities > 0) {
      const businessLabel = weekActivity.opportunities === 1 ? 'novo negócio' : 'novos negócios';
      if (weekActivity.source_conversations > 0) {
        const sourceLabel = weekActivity.source_conversations === 1
          ? '1 conversa do acervo'
          : `${weekActivity.source_conversations} conversas do acervo`;
        const historicalSources = Math.max(
          weekActivity.source_conversations - weekActivity.recent_source_conversations,
          0
        );
        const historicalNote = historicalSources > 0
          ? `; ${historicalSources === 1 ? '1 delas é anterior' : `${historicalSources} delas são anteriores`} a essa janela`
          : '';
        sentences.push(
          `Nesse período, a IA registrou ${weekActivity.opportunities} ${businessLabel} a partir de ${sourceLabel}${historicalNote}.`
        );
      } else {
        sentences.push(
          `Nesse período, a IA registrou ${weekActivity.opportunities} ${businessLabel}, mas eles ainda não possuem conversas de origem vinculadas.`
        );
      }
    }
    if (weekActivity.top_type && weekActivity.top_type_count > 0) {
      const label = DEMAND_LABEL[weekActivity.top_type] || weekActivity.top_type;
      sentences.push(
        `${label} lidera as novas oportunidades, com ${weekActivity.top_type_count} ${weekActivity.top_type_count === 1 ? 'registro' : 'registros'}.`
      );
    }
    if (weekActivity.suggested_contents > 0) {
      sentences.push(
        `${weekActivity.suggested_contents} ${weekActivity.suggested_contents === 1 ? 'conteúdo sugerido aguarda' : 'conteúdos sugeridos aguardam'} revisão.`
      );
    }
    const weekSummary = sentences.length > 0 ? sentences.join(' ') : null;

    return NextResponse.json({
      data: {
        greetingName,
        kpis,
        queue,
        recentConversations,
        pipeline,
        themes,
        themeCoverage,
        demand,
        volume,
        volumeMax,
        volumeTotal,
        evidence,
        coverage,
        lastProject,
        weekSummary,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json(
      { error: 'Falha ao carregar o dashboard' },
      { status: 500 }
    );
  }
}
