/**
 * node --import tsx scripts/qa/analysis-persistence.mts
 * Resultado de IA explicitamente SIMULADO; persistência PostgreSQL e funções
 * da aplicação reais. Nenhuma chamada ao Plaud/Azure ou outro HTTP externo.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NextRequest } from 'next/server';
import { configureQaEnvironment, QA_DATABASE_URL } from '@/scripts/qa/local-environment.mjs';
import type { TranscriptionResult } from '@/lib/ai/prompts/process-transcription';
import type { ConversationAiAnalysis, ConversationAiAnalysisLookup } from '@/lib/ai/conversation-analysis-store';

await configureQaEnvironment();
process.env.AZURE_OPENAI_API_KEY = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('QA/persistência: chamadas HTTP externas estão proibidas'); };

const reload = process.argv[2] === '--reload';
const pool = new pg.Pool({
  connectionString: QA_DATABASE_URL,
  max: 1,
  ...(reload ? { options: '-c default_transaction_read_only=on' } : {}),
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});
const globalForDb = globalThis as unknown as { __meetingsPool?: pg.Pool };
assert.equal(globalForDb.__meetingsPool, undefined);
globalForDb.__meetingsPool = pool;

interface LocalDetail {
  id: string;
  source: string;
  sourceFileId: string;
  title: string;
  summary: string;
  transcription: string;
  topics: string;
  participants: string;
  status: string;
}
interface ReloadResult {
  detail: LocalDetail;
  byId: ConversationAiAnalysisLookup | null;
  byFileId: ConversationAiAnalysisLookup | null;
  opportunityIds: string[];
}

let confirmed = false;
let fixtureCreated = false;
const conversationId = reload ? process.argv[3] : randomUUID();
const fileId = reload ? process.argv[4] : randomUUID().replaceAll('-', '');
const summaryId = randomUUID();
let passed = 0;
function pass(name: string) { passed++; console.log(`PASS ${name}`); }

async function cleanup() {
  await pool.query('BEGIN');
  try {
    // Mesmo se a persistência tiver parado entre oportunidade e fonte, todas
    // as linhas pertencem à conversa UUID criada exclusivamente por esta rodada.
    const { rows: opportunities } = await pool.query<{ id: string }>(
      'SELECT id FROM app_opportunities WHERE conversation_id = $1::uuid', [conversationId]
    );
    const ids = opportunities.map((row) => row.id);
    await pool.query('DELETE FROM app_opportunity_sources WHERE conversation_id = $1 OR opportunity_id = ANY($2::text[])', [conversationId, ids]);
    await pool.query('DELETE FROM app_opportunities WHERE id = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM conversations WHERE id = $1::uuid', [conversationId]);
    const { rows: [remaining] } = await pool.query(`SELECT
      (SELECT COUNT(*) FROM meetings WHERE id = $1::uuid) AS meetings,
      (SELECT COUNT(*) FROM summaries WHERE meeting_id = $1::uuid) AS summaries,
      (SELECT COUNT(*) FROM app_opportunities WHERE conversation_id = $1::uuid) AS opportunities,
      (SELECT COUNT(*) FROM app_opportunity_sources WHERE conversation_id = $1::text OR opportunity_id = ANY($2::text[])) AS sources`, [conversationId, ids]);
    assert.ok(Object.values(remaining).every((count) => count === '0'), 'A limpeza deve remover somente e todas as fixtures próprias');
    await pool.query('COMMIT');
    pass('limpeza por UUID/IDs próprios: zero conversa, resumo, oportunidades ou fontes restantes');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

try {
  const { rows: [identity] } = await pool.query(`SELECT current_database() AS db, current_user AS username,
    host(inet_server_addr()) AS host, inet_server_port() AS port,
    current_setting('transaction_read_only') AS read_only`);
  assert.deepEqual(identity, {
    db: 'pgm_qa', username: 'pgm_qa', host: '127.0.0.1', port: 55432, read_only: reload ? 'on' : 'off',
  });
  confirmed = true;
  assert.match(conversationId, /^[0-9a-f-]{36}$/);
  assert.match(fileId, /^[0-9a-f]{32}$/);

  const analysisStore = await import('@/lib/ai/conversation-analysis-store');
  const conversationHandler = await import('@/app/api/conversations/[id]/route');
  const opportunitiesHandler = await import('@/app/api/conversations/[id]/opportunities/route');
  const context = { params: Promise.resolve({ id: conversationId }) };
  const request = new NextRequest(`http://localhost:3100/api/conversations/${conversationId}`);

  if (reload) {
    // Processo novo: nenhum objeto/estado do persistTranscriptionResult original
    // pode servir como cache. O banco desta fase também impede escrita/lazy migration.
    const response = await conversationHandler.GET(request, context);
    assert.equal(response.status, 200);
    const { data: detail } = await response.json() as { data: LocalDetail };
    const byId = await analysisStore.getConversationAiAnalysisById(conversationId);
    const byFileId = await analysisStore.getConversationAiAnalysisByPlaudFileId(fileId);
    const opportunitiesResponse = await opportunitiesHandler.GET(request, context);
    assert.equal(opportunitiesResponse.status, 200);
    const { data: opportunities } = await opportunitiesResponse.json() as { data: Array<{ id: string }> };
    console.log(JSON.stringify({ detail, byId, byFileId, opportunityIds: opportunities.map((row) => row.id) } satisfies ReloadResult));
  } else {
    const title = `QA/API ${conversationId} Plaud sintético`;
    const originalSummary = 'Resumo ORIGINAL do Plaud — fixture QA/API. Este texto literal deve permanecer intacto após a análise da aplicação.';
    const originalTopics = ['Tópico original do Plaud'];
    const originalParticipants = ['Participante original QA'];
    const excerptOne = 'Precisamos de treinamento para padronizar a rotina sintética.';
    const excerptTwo = 'O controle fictício precisa de um sistema de acompanhamento.';
    const transcription = `Participante QA: ${excerptOne}\nParticipante QA: ${excerptTwo}`;
    const originalMetadata = {
      plaud_file_id: fileId,
      topics: originalTopics,
      participants: originalParticipants,
      tags: ['QA/API original'],
      type: 'reuniao',
      duration: '30',
      qa_fixture: conversationId,
      custom_preserved: { marker: 'manter', nested: [1, 2, 3] },
    };

    await pool.query(`INSERT INTO meetings (id, title, meeting_date, transcription, transcription_length, source, status, metadata)
      VALUES ($1, $2, '2026-09-04', $3, length($3), 'plaud', 'received', $4::jsonb)`,
    [conversationId, title, transcription, JSON.stringify(originalMetadata)]);
    fixtureCreated = true;
    await pool.query('INSERT INTO summaries (id, meeting_id, summary_text) VALUES ($1, $2, $3)', [summaryId, conversationId, originalSummary]);

    const before = await analysisStore.getConversationAiAnalysisByPlaudFileId(fileId);
    assert.deepEqual(before, { localConversationId: conversationId, analysis: null });
    pass('resumo Plaud original recém-ingerido não é confundido com análise da aplicação');

    // Payload determinístico SIMULADO: este teste não mede geração/qualidade de IA.
    const simulated: TranscriptionResult = {
      summary: 'ANÁLISE SIMULADA QA/API: interpretação independente, diferente do resumo original.',
      topics: ['Tópico da análise simulada'],
      participants: ['Participante da análise simulada'],
      suggestedTitle: 'Título sugerido simulado que não deve substituir o título existente',
      suggestedType: 'treinamento',
      problems: [{ description: 'Problema sintético de acompanhamento', mentions: 2, severity: 'media' }],
      opportunities: [
        { title: `QA/API ${conversationId} treinamento`, pain: 'Rotina sintética sem padronização', context: 'Cenário fictício de homologação', type: 'treinamento', subtype: ' Treinamento QA ', score: 81, excerpt: excerptOne },
        { title: `QA/API ${conversationId} sistema`, pain: 'Controle fictício disperso', context: 'Cenário fictício de homologação', type: 'sistema', subtype: '', score: 73, excerpt: excerptTwo },
      ],
    };
    const { transcriptionResultSchema } = await import('@/lib/ai/prompts/process-transcription');
    transcriptionResultSchema.parse(simulated);
    const { persistTranscriptionResult } = await import('@/lib/ai/persist-result');
    const result = await persistTranscriptionResult(conversationId, simulated, title);
    const analysis = result.aiAnalysis as ConversationAiAnalysis;
    assert.ok(analysis);
    assert.equal(result.conversation.summary, originalSummary);
    assert.equal(result.conversation.title, title);
    assert.equal(result.conversation.status, 'processado');
    assert.equal(result.conversation.type, 'treinamento');
    assert.equal(result.conversation.transcription, transcription);
    assert.deepEqual(JSON.parse(result.conversation.topics ?? 'null'), originalTopics);
    assert.deepEqual(JSON.parse(result.conversation.participants ?? 'null'), originalParticipants);
    pass('persistência real preserva resumo/transcrição/tópicos/participantes originais do Plaud');

    const { rows: [stored] } = await pool.query(`SELECT m.metadata, m.status,
      (SELECT summary_text FROM summaries WHERE id = $2) AS original_summary
      FROM meetings m WHERE m.id = $1::uuid`, [conversationId, summaryId]);
    assert.equal(stored.original_summary, originalSummary);
    assert.equal(stored.status, 'summarized');
    assert.deepEqual(stored.metadata.ai_analysis, analysis);
    assert.equal(analysis.summary, simulated.summary);
    assert.deepEqual(analysis.topics, simulated.topics);
    assert.deepEqual(analysis.participants, simulated.participants);
    assert.deepEqual(analysis.problems, simulated.problems);
    assert.equal(analysis.version, 1);
    assert.ok(Number.isFinite(Date.parse(analysis.analyzedAt)));
    assert.equal(stored.metadata.plaud_file_id, fileId);
    assert.equal(stored.metadata.qa_fixture, conversationId);
    assert.deepEqual(stored.metadata.custom_preserved, originalMetadata.custom_preserved);
    pass('metadata.ai_analysis coexiste com resumo original e metadata adicional, sem substituí-los');

    const { rows: links } = await pool.query<{
      id: string; title: string; conversation_id: string; source_id: string; source_conversation_id: string;
      subtype: string | null; score: number; excerpt: string;
    }>(`SELECT o.id, o.title, o.conversation_id::text, o.subtype, o.score,
      s.id AS source_id, s.conversation_id AS source_conversation_id, s.excerpt
      FROM app_opportunities o JOIN app_opportunity_sources s ON s.opportunity_id = o.id
      WHERE o.conversation_id = $1::uuid ORDER BY o.title`, [conversationId]);
    assert.equal(result.opportunities.length, simulated.opportunities.length);
    assert.equal(links.length, simulated.opportunities.length);
    assert.equal(new Set(links.map((row) => row.id)).size, simulated.opportunities.length);
    const { lerProcedencia } = await import('@/lib/ai/excerpt-provenance');
    for (const link of links) {
      const expected = simulated.opportunities.find((item) => item.title === link.title);
      assert.ok(expected);
      assert.equal(link.conversation_id, conversationId);
      assert.equal(link.source_conversation_id, conversationId);
      assert.ok(result.opportunities.some((item) => item.id === link.id));
      assert.equal(link.subtype, expected.subtype.trim() || null);
      assert.equal(link.score, expected.score);
      assert.deepEqual(lerProcedencia(link.excerpt), { texto: expected.excerpt, daTranscricao: true });
      assert.ok(transcription.includes(expected.excerpt));
    }
    pass('duas oportunidades e suas fontes apontam à conversa correta, com trechos literais e procedência');

    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--reload', conversationId, fileId], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, `Releitura em processo novo falhou: ${child.stderr}`);
    const reloaded = JSON.parse(child.stdout.trim()) as ReloadResult;
    assert.equal(reloaded.detail.summary, originalSummary);
    assert.equal(reloaded.detail.transcription, transcription);
    assert.equal(reloaded.detail.sourceFileId, fileId);
    assert.deepEqual(reloaded.byId, { localConversationId: conversationId, analysis });
    assert.deepEqual(reloaded.byFileId, reloaded.byId);
    assert.deepEqual(reloaded.opportunityIds.sort(), result.opportunities.map((item) => item.id).sort());
    pass('novo processo/handlers reais recuperam resumo original, análise separada e oportunidades persistidas');

    const { rows: [afterReload] } = await pool.query('SELECT metadata->\'ai_analysis\' AS analysis FROM meetings WHERE id = $1::uuid', [conversationId]);
    assert.deepEqual(afterReload.analysis, analysis);
    pass('releitura não altera nem recria metadata.ai_analysis');
  }
} finally {
  try { if (!reload && confirmed && fixtureCreated) await cleanup(); } finally {
    await pool.end();
    delete globalForDb.__meetingsPool;
    globalThis.fetch = originalFetch;
  }
}

if (!reload) console.log(`QA/persistência: ${passed} cenários PASS; payload de IA simulado; zero HTTP externo e zero fixtures próprias restantes.`);
