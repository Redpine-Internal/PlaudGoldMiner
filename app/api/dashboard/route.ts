import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// GET /api/dashboard - Agregado do Dashboard "Resumo".
// "conversations" é uma VIEW; somente leitura aqui (nunca .returning()).

interface HeroRow {
  id: string;
  title: string;
  description: string | null;
  insight_type: string;
  action_suggestion: string | null;
}

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

interface ThemeSourceRow {
  date: Date | string | null;
  topics: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
}

const HERO_SELECT = `SELECT id, title, description, insight_type, action_suggestion
                       FROM app_cross_insights`;

export async function GET() {
  try {
    const [
      processedRes,
      opportunitiesRes,
      contentsRes,
      insightsNewRes,
      pendingRes,
      suggestedRes,
      weekConversationsRes,
      heroRes,
      recentRes,
      pipelineRes,
      themesSourceRes,
      lastProjectRes,
      profileRes,
    ] = await Promise.all([
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations WHERE status = 'processado'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_opportunities`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_contents`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_cross_insights WHERE status = 'new'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations WHERE status = 'pendente'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM app_contents WHERE status = 'sugerido'`
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations
          WHERE status = 'processado' AND date >= now() - interval '7 days'`
      ),
      pool.query<HeroRow>(
        `${HERO_SELECT}
          WHERE status = 'new'
          ORDER BY (insight_type = 'opportunity') DESC, created_at DESC
          LIMIT 1`
      ),
      pool.query<ConversationRow>(
        `SELECT id, title, date FROM conversations
          ORDER BY date DESC NULLS LAST
          LIMIT 4`
      ),
      pool.query<PipelineRow>(
        `SELECT id, title, status, score FROM app_opportunities
          WHERE status IS DISTINCT FROM 'descartada'
          ORDER BY score DESC NULLS LAST
          LIMIT 4`
      ),
      pool.query<ThemeSourceRow>(
        `SELECT date, topics FROM conversations
          WHERE topics IS NOT NULL AND date >= now() - interval '60 days'`
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
    ]);

    // hero: fallback para qualquer status; tabela vazia -> null
    let heroRow: HeroRow | null = heroRes.rows[0] ?? null;
    if (!heroRow) {
      const fallback = await pool.query<HeroRow>(
        `${HERO_SELECT} ORDER BY created_at DESC LIMIT 1`
      );
      heroRow = fallback.rows[0] ?? null;
    }
    const hero = heroRow
      ? {
          id: heroRow.id,
          title: heroRow.title,
          description: heroRow.description ?? '',
          insightType: heroRow.insight_type,
          actionSuggestion: heroRow.action_suggestion ?? null,
        }
      : null;

    const recentConversations = recentRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      date: row.date ? new Date(row.date).toISOString() : '',
    }));

    const pipeline = pipelineRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      score: row.score ?? 0,
    }));

    // themes: menções por tópico em duas janelas (0-30d e 30-60d)
    const now = Date.now();
    const currentCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const themeMap = new Map<
      string,
      { name: string; current: number; previous: number }
    >();
    for (const row of themesSourceRes.rows) {
      if (!row.date || !row.topics) continue;
      const ts = new Date(row.date).getTime();
      if (!Number.isFinite(ts)) continue;

      let topics: unknown;
      try {
        topics = JSON.parse(row.topics);
      } catch {
        continue;
      }
      if (!Array.isArray(topics)) continue;

      const isCurrent = ts >= currentCutoff;
      for (const rawTopic of topics) {
        if (typeof rawTopic !== 'string') continue;
        const name = rawTopic.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        let entry = themeMap.get(key);
        if (!entry) {
          entry = { name, current: 0, previous: 0 };
          themeMap.set(key, entry);
        }
        if (isCurrent) entry.current += 1;
        else entry.previous += 1;
      }
    }
    const themes = Array.from(themeMap.values())
      .filter((t) => t.current > 0)
      .sort((a, b) => b.current - a.current)
      .slice(0, 4)
      .map((t) => ({
        name: t.name,
        count: t.current,
        delta: t.current - t.previous,
      }));

    // lastProject: fallback sem filtro de status; tabela vazia -> null
    let projectRow: ProjectRow | null = lastProjectRes.rows[0] ?? null;
    if (!projectRow) {
      const fallback = await pool.query<ProjectRow>(
        `SELECT id, title, description FROM app_projects
          ORDER BY created_at DESC
          LIMIT 1`
      );
      projectRow = fallback.rows[0] ?? null;
    }
    const lastProject = projectRow
      ? {
          id: projectRow.id,
          title: projectRow.title,
          description: projectRow.description ?? null,
        }
      : null;

    const greetingName =
      profileRes.rows[0]?.name?.trim().split(' ')[0] ?? '';

    const kpis = {
      conversations: processedRes.rows[0]?.count ?? 0,
      opportunities: opportunitiesRes.rows[0]?.count ?? 0,
      contents: contentsRes.rows[0]?.count ?? 0,
      insightsNew: insightsNewRes.rows[0]?.count ?? 0,
    };

    const queue = {
      pendingConversations: pendingRes.rows[0]?.count ?? 0,
      newInsights: kpis.insightsNew,
      suggestedContents: suggestedRes.rows[0]?.count ?? 0,
    };

    // weekSummary: frases determinísticas em pt-BR
    const weekConversations = weekConversationsRes.rows[0]?.count ?? 0;
    const sentences: string[] = [];
    if (weekConversations > 0) {
      sentences.push(
        weekConversations === 1
          ? 'Foi processada 1 conversa nos últimos 7 dias.'
          : `Foram processadas ${weekConversations} conversas nos últimos 7 dias.`
      );
    } else if (kpis.conversations > 0) {
      sentences.push('Nenhuma conversa nova foi processada nos últimos 7 dias.');
    }
    if (pipeline[0]) {
      sentences.push(
        `A oportunidade mais forte do pipeline é "${pipeline[0].title}" (score ${Math.round(pipeline[0].score)}).`
      );
    }
    if (themes[0]) {
      sentences.push(
        `O tema mais recorrente do mês é "${themes[0].name}", com ${themes[0].count} ${themes[0].count === 1 ? 'menção' : 'menções'}.`
      );
    }
    const weekSummary = sentences.length > 0 ? sentences.join(' ') : null;

    return NextResponse.json({
      data: {
        greetingName,
        kpis,
        queue,
        hero,
        recentConversations,
        pipeline,
        themes,
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
