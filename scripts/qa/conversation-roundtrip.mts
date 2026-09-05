/**
 * TZ=America/New_York node --import tsx scripts/qa/conversation-roundtrip.mts
 *
 * Round-trip dos handlers reais de upload/PATCH/GET no PostgreSQL isolado.
 * Não processa IA. Toda chamada fetch é proibida e o destino do banco é
 * validado antes de importar a aplicação. Somente fixtures próprias são limpas.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureQaEnvironment } from '@/scripts/qa/local-environment.mjs';

await configureQaEnvironment();
process.env.AZURE_OPENAI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
const originalFetch = globalThis.fetch;
let attemptedHttp = 0;
globalThis.fetch = async () => {
  attemptedHttp++;
  throw new Error('QA/API/CONVERSA: chamada HTTP proibida; não acionar IA ou serviços externos.');
};

const { NextRequest } = await import('next/server');
const { pool } = await import('@/lib/db');
const upload = await import('@/app/api/conversations/upload/route');
const detail = await import('@/app/api/conversations/[id]/route');
const { MAX_FILE_SIZE } = await import('@/lib/validators/upload');

interface Conversation {
  id: string;
  title: string;
  date: string;
  duration: string | null;
  type: string;
  source: string;
  status: string;
  transcription: string;
  summary: string | null;
  topics: string | null;
  participants: string | null;
  tags: string | null;
}
interface ApiResult {
  status: number;
  body: { data?: Conversation; error?: string };
}
interface PhysicalRow {
  id: string;
  view_date: string;
  meeting_date: string;
  title: string;
  type: string;
  duration: string | null;
  source: string;
  transcription: string;
  summary: string | null;
  tags: string | null;
  topics: string | null;
  participants: string | null;
  metadata: Record<string, unknown>;
}

const runId = randomUUID();
const prefix = `QA/API/CONVERSA ${runId}`;
const ownIds = new Set<string>();
const attemptedTitles = new Set<string>();
const failures: string[] = [];
let passed = 0;

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

function expectStatus(result: ApiResult, expected: number): void {
  assert.equal(result.status, expected, `HTTP ${result.status}, esperado ${expected}: ${result.body.error ?? ''}`);
}

async function rememberCreated(title: string) {
  // Também recupera uma criação parcial cujo handler falhou depois do INSERT.
  // O título contém um UUID exclusivo desta execução, previamente ausente.
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id::text AS id FROM meetings WHERE title = $1 AND source = 'upload'", [title],
  );
  for (const row of rows) ownIds.add(row.id);
}

async function uploadFile(extension: string, contents: string, title: string, metadata: Record<string, string> = {}): Promise<ApiResult> {
  assert.ok(title.startsWith(`${prefix} `), 'Fixture fora do prefixo exclusivo');
  const { rows: [prior] } = await pool.query<{ total: string }>('SELECT count(*) AS total FROM meetings WHERE title = $1', [title]);
  assert.equal(prior.total, '0', 'O título da fixture já existe: não criar nem limpar um registro anterior');
  attemptedTitles.add(title);
  const form = new FormData();
  form.set('file', new File([contents], `qa-api-conversa-${runId}.${extension}`, {
    type: extension.toLowerCase() === 'json' ? 'application/json' : 'text/plain',
  }));
  form.set('title', title);
  form.set('type', 'informal');
  form.set('date', '2026-09-01');
  form.set('duration', '12min');
  for (const [key, value] of Object.entries(metadata)) form.set(key, value);
  try {
    const response = await upload.POST(new NextRequest('http://localhost:3100/api/conversations/upload', { method: 'POST', body: form }));
    return { status: response.status, body: await response.json() };
  } finally {
    await rememberCreated(title);
  }
}

async function get(id: string): Promise<Conversation> {
  const response = await detail.GET(new NextRequest(`http://localhost:3100/api/conversations/${id}`), { params: Promise.resolve({ id }) });
  const result: ApiResult = { status: response.status, body: await response.json() };
  expectStatus(result, 200);
  assert.ok(result.body.data);
  return result.body.data;
}

async function patch(id: string, body: unknown): Promise<ApiResult> {
  assert.ok(ownIds.has(id), 'PATCH permitido somente em ID criado por este script');
  const response = await detail.PATCH(new NextRequest(`http://localhost:3100/api/conversations/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

async function physical(id: string): Promise<PhysicalRow> {
  assert.ok(ownIds.has(id));
  const { rows } = await pool.query<PhysicalRow>(`SELECT c.id::text AS id,
    c.date::text AS view_date, m.meeting_date::text AS meeting_date,
    c.title, c.type, c.duration, c.source, c.transcription, c.summary,
    c.tags, c.topics, c.participants, m.metadata
    FROM conversations c JOIN meetings m ON m.id = c.id WHERE c.id = $1::uuid`, [id]);
  assert.equal(rows.length, 1, 'A view deve corresponder a exatamente uma reunião física');
  return rows[0];
}

async function checkDay(id: string, expected: string, response?: Conversation) {
  const saved = await physical(id);
  const api = response ?? await get(id);
  assert.equal(api.date.slice(0, 10), expected, `Data da API: ${api.date}`);
  assert.equal(saved.view_date, expected, `Data da view: ${saved.view_date}`);
  assert.equal(saved.meeting_date, expected, `Data física: ${saved.meeting_date}`);
}

async function cleanup() {
  for (const title of attemptedTitles) await rememberCreated(title);
  const ids = [...ownIds];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: fixtures } = await client.query<{ id: string; title: string; source: string }>(
      'SELECT id::text AS id, title, source FROM meetings WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids],
    );
    for (const fixture of fixtures) {
      assert.ok(fixture.title.startsWith(`${prefix} `) && fixture.source === 'upload', `Recusa limpar ID sem identidade da fixture: ${fixture.id}`);
    }
    // O trigger real da view exclui a reunião e a FK limpa seus resumos.
    await client.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [ids]);
    const { rows: [remaining] } = await client.query<{ conversations: string; meetings: string; summaries: string }>(`SELECT
      (SELECT count(*) FROM conversations WHERE id = ANY($1::uuid[])) AS conversations,
      (SELECT count(*) FROM meetings WHERE id = ANY($1::uuid[])) AS meetings,
      (SELECT count(*) FROM summaries WHERE meeting_id = ANY($1::uuid[])) AS summaries`, [ids]);
    assert.deepEqual(remaining, { conversations: '0', meetings: '0', summaries: '0' });
    await client.query('COMMIT');
    console.log(`PASS limpeza de ${ids.length} IDs próprios: zero conversas, reuniões ou resumos restantes.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

try {
  const { rows: [identity] } = await pool.query(`SELECT current_database() AS db,
    current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port`);
  assert.deepEqual(identity, { db: 'pgm_qa', username: 'pgm_qa', host: '127.0.0.1', port: 55432 });
  const { rows: [timezone] } = await pool.query('SHOW timezone');
  console.log(`QA/API/CONVERSA ${runId}: banco isolado confirmado; Node ${Intl.DateTimeFormat().resolvedOptions().timeZone}; PostgreSQL ${timezone.TimeZone}.`);

  for (const [extension, text] of [
    ['txt', 'Transcrição sintética de QA. Segurança, treinamento e ação: sem dados pessoais.'],
    ['json', JSON.stringify({ transcription: 'Reunião sintética de QA, com acentuação e contexto.' })],
    ['JSON', JSON.stringify({ transcription: 'JSON válido com extensão maiúscula.' })],
  ]) {
    const title = `${prefix} ${extension}`;
    let id: string | undefined;
    await scenario(`upload ${extension.toUpperCase()} com FormData real e leitura persistida`, async () => {
      const result = await uploadFile(extension, text, title);
      expectStatus(result, 201);
      assert.ok(result.body.data?.id);
      id = result.body.data.id;
      assert.ok(ownIds.has(id));
      const saved = await get(id);
      assert.equal(saved.title, title);
      assert.equal(saved.source, 'upload');
      assert.equal(saved.status, 'pendente');
      assert.equal(saved.type, 'informal');
      assert.equal(saved.duration, '12min');
      assert.equal(saved.transcription, text);
      await checkDay(id, '2026-09-01');
    });
    if (!id) continue;
    const fixtureId = id;
    const tags = [`qa-${runId}`, 'segurança', 'ação & contexto'];
    const topics = ['Decisão sintética'];
    const participants = ['Pessoa de teste'];
    await scenario(`${extension}: PATCH metadados/data ISO/tags → GET, view e meetings`, async () => {
      const updated = await patch(fixtureId, {
        title: `${title} editada`, type: 'treinamento', date: '2026-09-04T00:00:00.000Z',
        duration: '45min', tags, topics, participants, summary: 'Resumo sintético de QA.',
      });
      expectStatus(updated, 200);
      await checkDay(fixtureId, '2026-09-04', updated.body.data);
      const read = await get(fixtureId);
      const saved = await physical(fixtureId);
      assert.equal(read.title, `${title} editada`);
      assert.equal(read.type, 'treinamento');
      assert.equal(read.duration, '45min');
      assert.equal(read.summary, 'Resumo sintético de QA.');
      for (const [key, expected] of [['tags', tags], ['topics', topics], ['participants', participants]] as const) {
        // O contrato da view usa JSON textual. Um parse deve produzir a lista,
        // nunca outra string (o erro antigo de dupla serialização).
        assert.deepEqual(JSON.parse(read[key] ?? 'null'), expected, `API ${key}`);
        assert.deepEqual(JSON.parse(saved[key] ?? 'null'), expected, `view ${key}`);
        assert.deepEqual(JSON.parse(String(saved.metadata[key])), expected, `meetings.metadata.${key}`);
      }
    });
    await scenario(`${extension}: dia YYYY-MM-DD repete sem deslocamento nem duplicação`, async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        expectStatus(await patch(fixtureId, { date: '2026-09-04' }), 200);
        await checkDay(fixtureId, '2026-09-04');
      }
    });
    await scenario(`${extension}: data inválida e tags serializadas são rejeitadas sem alterar os dados`, async () => {
      const before = await physical(fixtureId);
      expectStatus(await patch(fixtureId, { date: 'não-é-data' }), 400);
      expectStatus(await patch(fixtureId, { tags: JSON.stringify(tags) }), 400);
      assert.deepEqual(await physical(fixtureId), before);
    });
    await scenario(`${extension}: limpar listas opcionais persiste sem restaurar valores anteriores`, async () => {
      expectStatus(await patch(fixtureId, { tags: [], topics: [], participants: [], duration: '' }), 200);
      const saved = await get(fixtureId);
      for (const key of ['tags', 'topics', 'participants'] as const) assert.deepEqual(JSON.parse(saved[key] ?? 'null'), []);
      assert.ok(saved.duration === '' || saved.duration === null);
      await checkDay(fixtureId, '2026-09-04');
    });
  }

  for (const [extension, contents] of [['mp3', 'arquivo não permitido'], ['json', '{ inválido'], ['JSON', '{ inválido']]) {
    await scenario(`arquivo inválido .${extension} é rejeitado sem criar reunião`, async () => {
      const title = `${prefix} inválido-${extension}`;
      const result = await uploadFile(extension, contents, title);
      expectStatus(result, 400);
      const { rows: [count] } = await pool.query<{ total: string }>('SELECT count(*) AS total FROM meetings WHERE title = $1', [title]);
      assert.equal(count.total, '0');
    });
  }
  for (const [suffix, extension, contents] of [
    ['txt-vazio', 'txt', ''], ['txt-espacos', 'txt', '  \n\t'], ['json-vazio', 'json', ''],
  ]) {
    await scenario(`arquivo vazio ${suffix} é rejeitado antes de criar reunião`, async () => {
      expectStatus(await uploadFile(extension, contents, `${prefix} ${suffix}`), 400);
    });
  }
  for (const [suffix, metadata] of [
    ['tipo', { type: 'inexistente' }], ['data', { date: 'não-é-data' }],
  ] as const) {
    await scenario(`metadado inválido ${suffix} retorna 400, não erro interno`, async () => {
      expectStatus(await uploadFile('txt', 'Conteúdo sintético.', `${prefix} metadado-${suffix}`, metadata), 400);
    });
  }
  await scenario('campo file textual retorna 400, não erro interno', async () => {
    const form = new FormData();
    form.set('file', 'não é um arquivo');
    const response = await upload.POST(new NextRequest('http://localhost:3100/api/conversations/upload', { method: 'POST', body: form }));
    assert.equal(response.status, 400);
  });
  await scenario('TXT exatamente no limite de 10 MB é aceito', async () => {
    const result = await uploadFile('txt', 'x'.repeat(MAX_FILE_SIZE), `${prefix} tamanho-limite`);
    expectStatus(result, 201);
    assert.equal(result.body.data?.transcription.length, MAX_FILE_SIZE);
  });
  await scenario('TXT acima do limite é rejeitado com 413', async () => {
    expectStatus(await uploadFile('txt', 'x'.repeat(MAX_FILE_SIZE + 1), `${prefix} acima-limite`), 413);
  });
  await scenario('requisição sem arquivo retorna 400', async () => {
    const response = await upload.POST(new NextRequest('http://localhost:3100/api/conversations/upload', { method: 'POST', body: new FormData() }));
    assert.equal(response.status, 400);
  });
  await scenario('nenhuma chamada HTTP/IA foi tentada', async () => { assert.equal(attemptedHttp, 0); });
} finally {
  try { await cleanup(); } finally {
    globalThis.fetch = originalFetch;
    await pool.end();
  }
}

console.log(`QA/API/CONVERSA: ${passed} cenário(s) PASS; ${failures.length} falha(s).`);
if (failures.length) process.exitCode = 1;
