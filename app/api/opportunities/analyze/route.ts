import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { opportunities, opportunitySources } from '@/lib/db/schema';
import {
  analyzeOpportunityBatch,
  type BatchConversation,
} from '@/lib/ai/services/opportunity-batch-analyzer';

/**
 * Gera Novos Negócios a partir de um RANGE de reuniões.
 *
 * Três modos de seleção (body JSON):
 *   { mode: 'period', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }  — tudo no período
 *   { mode: 'selection', conversationIds: [...] }             — seleção manual
 *   { mode: 'single', conversationId: '...' }                 — uma conversa só
 *
 * Sem body (compat com o botão antigo), cai no modo 'pending': as conversas
 * processadas que ainda não geraram nenhuma oportunidade, limitadas a 20.
 *
 * Diferente do fluxo antigo (1 conversa → 1 análise), aqui a IA lê o conjunto
 * inteiro e uma oportunidade pode nascer com várias conversas de origem.
 */

const MAX_CONVERSATIONS = 40;

interface ConversationRow {
  id: string;
  title: string | null;
  date: string | null;
  transcription: string;
  summary: string | null;
  topics: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const mode: string = typeof body?.mode === 'string' ? body.mode : 'pending';

    let rows: ConversationRow[];
    let label: string;

    // Base comum: só conversa processada e com transcrição real.
    const BASE = `SELECT c.id::text AS id, c.title, c.date::text AS date, c.transcription,
                         c.summary, c.topics
                    FROM conversations c
                   WHERE c.status = 'processado'
                     AND c.transcription IS NOT NULL
                     AND trim(c.transcription) <> ''`;

    if (mode === 'period') {
      const from = typeof body?.from === 'string' ? body.from : null;
      const to = typeof body?.to === 'string' ? body.to : null;
      if (!from || !to) {
        return NextResponse.json(
          { error: 'Modo período exige "from" e "to" no formato YYYY-MM-DD.' },
          { status: 400 }
        );
      }
      const res = await pool.query<ConversationRow>(
        `${BASE} AND c.date >= $1::date AND c.date <= $2::date
          ORDER BY c.date ASC LIMIT ${MAX_CONVERSATIONS}`,
        [from, to]
      );
      rows = res.rows;
      label = `período ${from} a ${to}`;
    } else if (mode === 'selection') {
      const ids: unknown = body?.conversationIds;
      if (!Array.isArray(ids) || !ids.length) {
        return NextResponse.json(
          { error: 'Modo seleção exige "conversationIds" com ao menos um id.' },
          { status: 400 }
        );
      }
      const clean = ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_CONVERSATIONS);
      const res = await pool.query<ConversationRow>(
        `${BASE} AND c.id = ANY($1::uuid[]) ORDER BY c.date ASC`,
        [clean]
      );
      rows = res.rows;
      label = `${rows.length} conversa(s) selecionada(s)`;
    } else if (mode === 'single') {
      const id = typeof body?.conversationId === 'string' ? body.conversationId : null;
      if (!id) {
        return NextResponse.json(
          { error: 'Modo conversa única exige "conversationId".' },
          { status: 400 }
        );
      }
      const res = await pool.query<ConversationRow>(`${BASE} AND c.id = $1::uuid LIMIT 1`, [id]);
      rows = res.rows;
      label = 'conversa única';
    } else {
      // Compat: conversas processadas que ainda não geraram oportunidade.
      const res = await pool.query<ConversationRow>(
        `${BASE} AND NOT EXISTS (
             SELECT 1 FROM app_opportunities o WHERE o.conversation_id = c.id
           )
          ORDER BY c.date DESC LIMIT 20`
      );
      rows = res.rows;
      label = 'conversas pendentes';
    }

    if (!rows.length) {
      return NextResponse.json({
        data: [],
        processed: 0,
        message: `Nenhuma conversa elegível em ${label}.`,
      });
    }

    const items: BatchConversation[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      transcription: r.transcription,
      summary: r.summary,
      topics: r.topics,
    }));

    const result = await analyzeOpportunityBatch(items);
    if (!result.success) {
      const status = result.error.code === 'RATE_LIMIT' ? 429 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    // Reanalisar o mesmo range é comum (ajustar datas, incluir mais uma reunião).
    // Sem isso, cada rodada recriaria as mesmas oportunidades. Compara por título
    // normalizado entre as que já saíram das conversas deste conjunto.
    const convIds = rows.map((r) => r.id);
    const existingRes = await pool.query<{ title: string }>(
      // As duas colunas guardam o mesmo id com tipos diferentes: uuid na
      // oportunidade, text na fonte. O cast tem que ser feito por coluna.
      `SELECT DISTINCT o.title
         FROM app_opportunities o
    LEFT JOIN app_opportunity_sources s ON s.opportunity_id = o.id
        WHERE o.conversation_id = ANY($1::uuid[])
           OR s.conversation_id = ANY($1::text[])`,
      [convIds]
    );
    const known = new Set(existingRes.rows.map((r) => r.title.trim().toLowerCase()));

    // Persiste: 1 linha em app_opportunities + N linhas em app_opportunity_sources.
    // conversation_id da oportunidade guarda a 1ª fonte (compat com a UI atual);
    // o conjunto completo vive na tabela de fontes.
    const created = [];
    let skipped = 0;
    for (const opp of result.data) {
      if (known.has(opp.title.trim().toLowerCase())) {
        skipped++;
        continue;
      }
      known.add(opp.title.trim().toLowerCase());
      const id = crypto.randomUUID();
      const [row] = await db
        .insert(opportunities)
        .values({
          id,
          conversationId: opp.sources[0].conversationId,
          title: opp.title,
          pain: opp.pain,
          context: opp.context,
          type: opp.type,
          subtype: opp.subtype,
          score: opp.score,
          status: 'nova',
        })
        .returning();

      for (const src of opp.sources) {
        await db
          .insert(opportunitySources)
          .values({
            id: crypto.randomUUID(),
            opportunityId: id,
            conversationId: src.conversationId,
            excerpt: src.excerpt,
          })
          .onConflictDoNothing();
      }
      created.push(row);
    }

    return NextResponse.json({
      data: created,
      processed: rows.length,
      groups: result.groups,
      skipped,
      message:
        `${created.length} oportunidade(s) a partir de ${rows.length} conversa(s) — ${label}.` +
        (skipped ? ` ${skipped} já existia(m) e foi(ram) ignorada(s).` : ''),
    });
  } catch (error) {
    console.error('[API] POST /api/opportunities/analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
