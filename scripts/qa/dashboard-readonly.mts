/**
 * node --import tsx scripts/qa/dashboard-readonly.mts
 * GET real + agregações independentes, no mesmo snapshot local READ ONLY.
 * Não cria fixtures, não importa geradores e não faz chamadas HTTP.
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { configureQaEnvironment, QA_DATABASE_URL } from '@/scripts/qa/local-environment.mjs';

await configureQaEnvironment();
process.env.AZURE_OPENAI_API_KEY = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('QA/dashboard: chamadas HTTP externas estão proibidas'); };

// Um único cliente físico mantém o GET (inclusive seu Promise.all) e as
// consultas de controle na mesma transação. Todas as queries continuam reais.
const pool = new pg.Pool({
  connectionString: QA_DATABASE_URL,
  max: 1,
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});
const globalForDb = globalThis as unknown as { __meetingsPool?: pg.Pool };
assert.equal(globalForDb.__meetingsPool, undefined, 'O handler deve ser importado apenas depois do pool QA');
globalForDb.__meetingsPool = pool;

interface Dashboard {
  kpis: { conversations: number; opportunities: number; contents: number };
  queue: { pendingConversations: number; suggestedContents: number };
  coverage: { linked: number; total: number; percent: number };
  evidence: {
    buckets: Array<{ sources: number; opportunities: number }>;
    total: number; max: number; avgSources: number; withoutSources: number; single: number; sourceLinks: number;
  };
  demand: Array<{ type: string; count: number; conversations: number; avgScore: number; reach: number; topTitle: string | null }>;
  recentConversations: Array<{ id: string; title: string; date: string }>;
  pipeline: Array<{ id: string; title: string; status: string; score: number }>;
  volume: Array<{ month: string; total: number }>;
  volumeTotal: number;
  volumeMax: number;
  themeCoverage: { total: number; mapped: number; ungrouped: number; percent: number };
}

const failures: string[] = [];
let passed = 0;
let transactionStarted = false;
async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = `${name}: ${error instanceof Error ? error.message : String(error)}`;
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
}

try {
  const { rows: [identity] } = await pool.query(`SELECT current_database() AS db,
    current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port,
    current_setting('transaction_read_only') AS read_only`);
  assert.deepEqual(identity, { db: 'pgm_qa', username: 'pgm_qa', host: '127.0.0.1', port: 55432, read_only: 'on' });
  await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transactionStarted = true;
  const { rows: [snapshot] } = await pool.query("SELECT current_setting('transaction_isolation') AS isolation, current_date::text AS date");
  assert.equal(snapshot.isolation, 'repeatable read');

  const { GET } = await import('@/app/api/dashboard/route');
  const response = await GET();
  assert.equal(response.status, 200, 'GET /api/dashboard deve responder 200');
  const { data } = await response.json() as { data: Dashboard };
  console.log(`QA/dashboard: snapshot somente leitura confirmado (${snapshot.date}).`);

  await scenario('KPIs e fila correspondem às contagens físicas', async () => {
    const { rows: [expected] } = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'processado')::int AS processed,
      COUNT(*) FILTER (WHERE status = 'pendente')::int AS pending,
      (SELECT COUNT(*)::int FROM app_opportunities WHERE status IS DISTINCT FROM 'descartada') AS opportunities,
      (SELECT COUNT(*)::int FROM app_contents WHERE status = 'sugerido') AS contents
      FROM conversations`);
    assert.deepEqual(data.kpis, { conversations: expected.processed, opportunities: expected.opportunities, contents: expected.contents });
    assert.deepEqual(data.queue, { pendingConversations: expected.pending, suggestedContents: expected.contents });
    console.log(`  SQL: ${expected.processed} processadas, ${expected.pending} pendentes, ${expected.opportunities} negócios ativos, ${expected.contents} conteúdos sugeridos.`);
  });

  await scenario('cobertura conta conversas distintas, existentes e processadas', async () => {
    const { rows: [expected] } = await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM app_opportunity_sources s
        JOIN app_opportunities o ON o.id = s.opportunity_id
        WHERE s.conversation_id = c.id::text AND o.status IS DISTINCT FROM 'descartada'
      ))::int AS linked FROM conversations c WHERE c.status = 'processado'`);
    assert.deepEqual(data.coverage, { ...expected, percent: expected.total ? Math.round(expected.linked * 100 / expected.total) : 0 });
    assert.equal(data.coverage.total, data.kpis.conversations);
    console.log(`  SQL: ${expected.linked}/${expected.total} conversas cobertas.`);
  });

  await scenario('evidências: distribuição, fontes distintas, média e totais', async () => {
    const { rows: expected } = await pool.query<{ sources: number; opportunities: number }>(`WITH links AS (
      SELECT DISTINCT s.opportunity_id, c.id FROM app_opportunity_sources s
      JOIN conversations c ON c.id::text = s.conversation_id WHERE c.status = 'processado'
    ), quantities AS (
      SELECT o.id, (SELECT COUNT(*)::int FROM links l WHERE l.opportunity_id = o.id) AS sources
      FROM app_opportunities o WHERE o.status IS DISTINCT FROM 'descartada'
    ) SELECT sources, COUNT(*)::int AS opportunities FROM quantities GROUP BY sources ORDER BY sources`);
    assert.deepEqual(data.evidence.buckets, expected);
    const total = expected.reduce((sum, row) => sum + row.opportunities, 0);
    const links = expected.reduce((sum, row) => sum + row.sources * row.opportunities, 0);
    assert.equal(data.evidence.total, total);
    assert.equal(total, data.kpis.opportunities);
    assert.equal(data.evidence.sourceLinks, links);
    assert.equal(data.evidence.avgSources, total ? Math.round(links / total * 10) / 10 : 0);
    assert.equal(data.evidence.max, Math.max(0, ...expected.map((row) => row.opportunities)));
    assert.equal(data.evidence.single, expected.find((row) => row.sources === 1)?.opportunities ?? 0);
    assert.equal(data.evidence.withoutSources, expected.find((row) => row.sources === 0)?.opportunities ?? 0);
    console.log(`  SQL: ${total} negócios, ${links} vínculos distintos; buckets ${JSON.stringify(expected)}.`);
  });

  await scenario('demanda: tipos, média por negócio, conversas distintas e alcance', async () => {
    const { rows: expected } = await pool.query<{
      type: string; count: number; avg_score: number | null; conversations: number; top_titles: string[];
    }>(`SELECT totals.*,
      (SELECT COUNT(DISTINCT c.id)::int FROM conversations c
       JOIN app_opportunity_sources s ON s.conversation_id = c.id::text
       JOIN app_opportunities o ON o.id = s.opportunity_id
       WHERE c.status = 'processado' AND o.status IS DISTINCT FROM 'descartada' AND o.type = totals.type) AS conversations,
      ARRAY(SELECT o.title FROM app_opportunities o
        WHERE o.type = totals.type AND o.status IS DISTINCT FROM 'descartada'
        AND o.score IS NOT DISTINCT FROM (SELECT MAX(score) FROM app_opportunities
          WHERE type = totals.type AND status IS DISTINCT FROM 'descartada')) AS top_titles
      FROM (SELECT type, COUNT(*)::int AS count, ROUND(AVG(score))::int AS avg_score
        FROM app_opportunities WHERE status IS DISTINCT FROM 'descartada' GROUP BY type) totals`);
    assert.equal(data.demand.length, expected.length);
    for (const row of expected) {
      const actual = data.demand.find((item) => item.type === row.type);
      assert.ok(actual, `Tipo ausente: ${row.type}`);
      assert.equal(actual.count, row.count, `${row.type}: quantidade`);
      assert.equal(actual.conversations, row.conversations, `${row.type}: conversas distintas`);
      assert.equal(actual.avgScore, row.avg_score ?? 0, `${row.type}: média deve dar peso igual a cada negócio`);
      assert.equal(actual.reach, data.coverage.linked ? Math.round(row.conversations * 100 / data.coverage.linked) : 0);
      assert.ok(row.top_titles.includes(actual.topTitle ?? ''), `${row.type}: topTitle deve ter a maior pontuação`);
    }
    for (let index = 1; index < data.demand.length; index++) {
      const previous = data.demand[index - 1];
      const current = data.demand[index];
      assert.ok(previous.conversations > current.conversations || previous.conversations === current.conversations && previous.count >= current.count);
    }
    console.log(`  SQL: ${expected.map((row) => `${row.type}=${row.count}, média ${row.avg_score}`).join('; ')}.`);
  });

  await scenario('conversas recentes: IDs navegáveis, datas calendário e ordem', async () => {
    const { rows: expected } = await pool.query<{ id: string; source_file_id: string | null; title: string; date: string | null }>(
      "SELECT id::text, source_file_id, title, date::text FROM conversations WHERE status = 'processado' ORDER BY date DESC NULLS LAST"
    );
    assert.equal(data.recentConversations.length, Math.min(4, expected.length));
    for (const [index, recent] of data.recentConversations.entries()) {
      const original = expected.find((row) => (row.source_file_id || row.id) === recent.id);
      assert.ok(original, 'Conversa recente precisa existir e estar processada');
      assert.equal(recent.title, original.title);
      assert.equal(recent.date, original.date ?? '', 'DATE não pode mudar de dia pela conversão de fuso');
      // Empates de data não têm desempate contratado pela rota.
      assert.equal(recent.date, expected[index].date ?? '', 'Recentes fora de ordem');
    }
  });

  await scenario('pipeline só contém negócios ativos e maiores pontuações', async () => {
    const { rows: expected } = await pool.query<{ id: string; title: string; status: string; score: number | null }>(
      "SELECT id, title, status, score FROM app_opportunities WHERE status IS DISTINCT FROM 'descartada' ORDER BY score DESC NULLS LAST"
    );
    assert.equal(data.pipeline.length, Math.min(4, expected.length));
    for (const [index, item] of data.pipeline.entries()) {
      const original = expected.find((row) => row.id === item.id);
      assert.ok(original);
      assert.deepEqual(item, { ...original, score: original.score ?? 0 });
      assert.equal(item.score, expected[index].score ?? 0);
    }
  });

  await scenario('volume mensal: 12 meses completos, zeros, total e máximo', async () => {
    const { rows: expected } = await pool.query<{ month: string; total: number }>(`SELECT to_char(date, 'YYYY-MM') AS month, COUNT(*)::int AS total
      FROM conversations WHERE status = 'processado'
      AND date >= date_trunc('month', current_date) - interval '11 months'
      AND date < date_trunc('month', current_date) + interval '1 month'
      GROUP BY to_char(date, 'YYYY-MM')`);
    const [year, month] = snapshot.date.split('-').map(Number);
    const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
    assert.deepEqual(data.volume.map((row) => row.month), months);
    for (const row of data.volume) assert.equal(row.total, expected.find((item) => item.month === row.month)?.total ?? 0);
    assert.equal(data.volumeTotal, expected.reduce((sum, row) => sum + row.total, 0));
    assert.equal(data.volumeMax, Math.max(0, ...expected.map((row) => row.total)));
  });

  await scenario('cobertura de temas conta negócios, sem duplicar associações', async () => {
    const { rows: [expected] } = await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE id IN (SELECT opportunity_id FROM app_business_theme_members))::int AS mapped
      FROM app_opportunities WHERE status IS DISTINCT FROM 'descartada'`);
    assert.equal(data.themeCoverage.total, expected.total);
    assert.equal(data.themeCoverage.mapped, expected.mapped);
    assert.equal(data.themeCoverage.ungrouped, expected.total - expected.mapped);
    assert.equal(data.themeCoverage.percent, expected.total ? Math.round(expected.mapped * 100 / expected.total) : 0);
  });
} finally {
  try { if (transactionStarted) await pool.query('ROLLBACK'); } finally {
    await pool.end();
    delete globalForDb.__meetingsPool;
    globalThis.fetch = originalFetch;
  }
}

console.log(`QA/dashboard: ${passed} cenários PASS; ${failures.length} falha(s); nenhuma escrita.`);
if (failures.length) process.exitCode = 1;
