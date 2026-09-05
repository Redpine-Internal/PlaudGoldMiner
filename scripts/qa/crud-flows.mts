/**
 * node --import tsx scripts/qa/crud-flows.mts
 * Integração real dos handlers com pgm_qa. Somente fixtures QA/API próprias;
 * nenhuma geração, upload ou chamada HTTP externa. A limpeza roda no finally.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { configureQaEnvironment } from '@/scripts/qa/local-environment.mjs';

await configureQaEnvironment();
process.env.AZURE_OPENAI_API_KEY = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('QA/API: chamadas HTTP externas estão proibidas'); };

const { pool } = await import('@/lib/db');
const projectList = await import('@/app/api/projects/route');
const projectDetail = await import('@/app/api/projects/[id]/route');
const projectColumns = await import('@/app/api/projects/[id]/columns/route');
const projectTasks = await import('@/app/api/projects/[id]/tasks/route');
const columnDetail = await import('@/app/api/columns/[id]/route');
const taskDetail = await import('@/app/api/tasks/[id]/route');
const contentList = await import('@/app/api/contents/route');
const contentDetail = await import('@/app/api/contents/[id]/route');
const enrichment = await import('@/app/api/enrichment/route');
const reference = await import('@/app/api/enrichment/reference/route');
const interesting = await import('@/app/api/enrichment/interesting/route');
const conversationDetail = await import('@/app/api/conversations/[id]/route');

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;
interface Project { id: string; title: string; description: string | null; status: string; }
interface Column { id: string; projectId: string; name: string; position: number; }
interface Task { id: string; projectId: string; columnId: string; title: string; detail: string | null; position: number; }
interface Board { project: Project; columns: Column[]; tasks: Task[]; }
interface Content { id: string; title: string; status: string; notes: string | null; draft?: string | null; }
interface Reference { id: string; title: string | null; url: string; kind: string; }
interface Enrichment { id: string; sourceId: string; interesting: boolean; notes: string | null; textOverride: string | null; references: Reference[]; }
interface ApiResult<T> { status: number; body: { data: T; error?: string; total?: number }; }

const prefix = `QA/API ${randomUUID()}`;
const projects = new Set<string>();
const columns = new Set<string>();
const tasks = new Set<string>();
const contents = new Set<string>();
const references = new Set<string>();
const conversations = new Set<string>();
const missingId = randomUUID();
const failures: string[] = [];
let passed = 0;
let localDbConfirmed = false;

async function call<T>(handler: Handler, method: string, path: string, body?: unknown, id: string = missingId): Promise<ApiResult<T>> {
  const response = await handler(new NextRequest(`http://localhost:3100${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

function status<T>(result: ApiResult<T>, expected: number) {
  assert.equal(result.status, expected, `HTTP ${result.status}; esperado ${expected}; ${result.body.error ?? ''}`);
}

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

async function createProject(suffix: string): Promise<Project> {
  const result = await call<Project>(projectList.POST, 'POST', '/api/projects', { title: `${prefix} ${suffix}`, description: 'Fixture sintética, sem dados reais.' });
  if (result.body.data?.id) projects.add(result.body.data.id);
  status(result, 201);
  assert.ok(result.body.data.id);
  return result.body.data;
}

async function board(id: string): Promise<Board> {
  const result = await call<Board>(projectDetail.GET, 'GET', `/api/projects/${id}`, undefined, id);
  status(result, 200);
  for (const column of result.body.data.columns) columns.add(column.id);
  return result.body.data;
}

async function createTask(projectId: string, columnId: string, suffix: string): Promise<Task> {
  const result = await call<Task>(projectTasks.POST, 'POST', `/api/projects/${projectId}/tasks`, {
    title: `${prefix} ${suffix}`, columnId, detail: 'Descrição sintética.',
  }, projectId);
  if (result.body.data?.id) tasks.add(result.body.data.id);
  status(result, 201);
  return result.body.data;
}

async function cleanup() {
  const projectIds = [...projects];
  const columnIds = [...columns];
  const taskIds = [...tasks];
  const contentIds = [...contents];
  const referenceIds = [...references];
  const conversationIds = [...conversations];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM app_idea_enrichment_reference WHERE id = ANY($1::uuid[])
      OR enrichment_id IN (SELECT id FROM app_idea_enrichment WHERE source_type = 'content' AND source_id = ANY($2::text[]))`, [referenceIds, contentIds]);
    await client.query("DELETE FROM app_idea_enrichment WHERE source_type = 'content' AND source_id = ANY($1::text[])", [contentIds]);
    await client.query('DELETE FROM app_content_sources WHERE content_id = ANY($1::text[])', [contentIds]);
    await client.query('DELETE FROM app_contents WHERE id = ANY($1::text[])', [contentIds]);
    await client.query('DELETE FROM app_project_tasks WHERE id = ANY($1::text[]) OR project_id = ANY($2::text[])', [taskIds, projectIds]);
    await client.query('DELETE FROM app_project_columns WHERE id = ANY($1::text[]) OR project_id = ANY($2::text[])', [columnIds, projectIds]);
    await client.query('DELETE FROM app_projects WHERE id = ANY($1::text[])', [projectIds]);
    await client.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [conversationIds]);
    await client.query('COMMIT');
    const { rows: [remaining] } = await client.query(`SELECT
      (SELECT COUNT(*) FROM app_projects WHERE id = ANY($1::text[])) AS projects,
      (SELECT COUNT(*) FROM app_project_columns WHERE id = ANY($2::text[]) OR project_id = ANY($1::text[])) AS columns,
      (SELECT COUNT(*) FROM app_project_tasks WHERE id = ANY($3::text[]) OR project_id = ANY($1::text[])) AS tasks,
      (SELECT COUNT(*) FROM app_contents WHERE id = ANY($4::text[])) AS contents,
      (SELECT COUNT(*) FROM app_idea_enrichment WHERE source_type = 'content' AND source_id = ANY($4::text[])) AS enrichment,
      (SELECT COUNT(*) FROM app_idea_enrichment_reference WHERE id = ANY($5::uuid[])) AS references,
      (SELECT COUNT(*) FROM meetings WHERE id = ANY($6::uuid[])) AS conversations,
      (SELECT COUNT(*) FROM summaries WHERE meeting_id = ANY($6::uuid[])) AS summaries`,
    [projectIds, columnIds, taskIds, contentIds, referenceIds, conversationIds]);
    assert.ok(Object.values(remaining).every((count) => count === '0'), `Fixtures restantes: ${JSON.stringify(remaining)}`);
    console.log('PASS limpeza conferida por IDs: zero projetos, colunas, tarefas, conteúdos, enriquecimentos, referências ou conversas próprios.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

try {
  const { rows: [identity] } = await pool.query('SELECT current_database() AS db, current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.deepEqual(identity, { db: 'pgm_qa', username: 'pgm_qa', host: '127.0.0.1', port: 55432 });
  localDbConfirmed = true;
  console.log(`QA/API banco isolado confirmado; execução ${prefix}.`);

  const project = await createProject('projeto principal');
  const otherProject = await createProject('projeto de fronteira');
  const initial = await board(project.id);
  const other = await board(otherProject.id);
  await scenario('projeto criado com quatro colunas e sem tarefas', async () => {
    assert.equal(initial.project.title, project.title);
    assert.equal(initial.project.status, 'ativo');
    assert.deepEqual(initial.columns.map((column) => column.name), ['Backlog', 'To Do', 'Doing', 'Done']);
    assert.equal(initial.tasks.length, 0);
    const list = await call<Project[]>(projectList.GET, 'GET', `/api/projects?search=${encodeURIComponent(prefix)}`);
    status(list, 200);
    assert.equal(list.body.total, 2);
  });

  await scenario('projeto edita título/descrição, pausa, reativa e arquiva', async () => {
    const title = `${prefix} projeto editado`;
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { title, description: '' }, project.id), 200);
    for (const value of ['pausado', 'ativo', 'arquivado']) {
      status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { status: value }, project.id), 200);
      assert.equal((await board(project.id)).project.status, value);
    }
    assert.equal((await board(project.id)).project.title, title);
    assert.equal((await board(project.id)).project.description, '');
  });
  await scenario('projeto rejeita status inválido e corpo sem campos', async () => {
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { status: 'inexistente' }, project.id), 400);
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, {}, project.id), 400);
    status(await call(projectList.POST, 'POST', '/api/projects', { title: '   ' }), 400);
  });
  for (const title of [null, '', '   ', 42, { invalid: true }]) {
    await scenario(`projeto rejeita título inválido ${JSON.stringify(title)}`, async () => {
      status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { title }, project.id), 400);
    });
  }
  await scenario('projeto rejeita descrição que não é texto', async () => {
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { description: { invalid: true } }, project.id), 400);
  });
  await scenario('projeto normaliza título e aceita limpar descrição com null', async () => {
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${project.id}`, { title: `  ${prefix} normalizado  `, description: null }, project.id), 200);
    const saved = (await board(project.id)).project;
    assert.equal(saved.title, `${prefix} normalizado`);
    assert.equal(saved.description, null);
  });
  await scenario('projeto inexistente retorna 404 em leitura/edição/exclusão', async () => {
    status(await call(projectDetail.GET, 'GET', `/api/projects/${missingId}`), 404);
    status(await call(projectDetail.PATCH, 'PATCH', `/api/projects/${missingId}`, { title: `${prefix} inexistente` }), 404);
    status(await call(projectDetail.DELETE, 'DELETE', `/api/projects/${missingId}`), 404);
  });

  const newColumn = await call<Column>(projectColumns.POST, 'POST', `/api/projects/${project.id}/columns`, { name: `${prefix} revisão` }, project.id);
  if (newColumn.body.data?.id) columns.add(newColumn.body.data.id);
  status(newColumn, 201);
  const column = newColumn.body.data;
  await scenario('coluna cria/renomeia/reordena e releitura persiste', async () => {
    status(await call(columnDetail.PATCH, 'PATCH', `/api/columns/${column.id}`, { name: `${prefix} validação`, position: 1500 }, column.id), 200);
    const persisted = (await board(project.id)).columns.find((item) => item.id === column.id);
    assert.equal(persisted?.name, `${prefix} validação`);
    assert.equal(persisted?.position, 1500);
  });
  await scenario('coluna em projeto inexistente deve retornar 404', async () => {
    const result = await call<Column>(projectColumns.POST, 'POST', `/api/projects/${missingId}/columns`, { name: `${prefix} órfã` });
    if (result.body.data?.id) columns.add(result.body.data.id);
    status(result, 404);
  });

  const task = await createTask(project.id, initial.columns[0].id, 'tarefa');
  await scenario('tarefa edita e move entre colunas do mesmo projeto', async () => {
    status(await call(taskDetail.PATCH, 'PATCH', `/api/tasks/${task.id}`, { title: `${prefix} tarefa editada`, detail: '', columnId: column.id, position: 2500 }, task.id), 200);
    const persisted = (await board(project.id)).tasks.find((item) => item.id === task.id);
    assert.equal(persisted?.title, `${prefix} tarefa editada`);
    assert.equal(persisted?.columnId, column.id);
    assert.equal(persisted?.detail, '');
    assert.equal(persisted?.position, 2500);
  });
  await scenario('tarefa não pode mover para coluna de outro projeto', async () => {
    status(await call(taskDetail.PATCH, 'PATCH', `/api/tasks/${task.id}`, { columnId: other.columns[0].id }, task.id), 400);
    assert.equal((await board(project.id)).tasks.find((item) => item.id === task.id)?.columnId, column.id);
  });
  await scenario('tarefa não pode nascer em coluna de outro projeto', async () => {
    const result = await call<Task>(projectTasks.POST, 'POST', `/api/projects/${project.id}/tasks`, { title: `${prefix} inválida`, columnId: other.columns[0].id }, project.id);
    if (result.body.data?.id) tasks.add(result.body.data.id);
    status(result, 400);
  });
  await scenario('coluna ocupada bloqueia exclusão; tarefa/coluna excluídas somem', async () => {
    status(await call(columnDetail.DELETE, 'DELETE', `/api/columns/${column.id}`, undefined, column.id), 409);
    status(await call(taskDetail.DELETE, 'DELETE', `/api/tasks/${task.id}`, undefined, task.id), 200);
    status(await call(taskDetail.DELETE, 'DELETE', `/api/tasks/${task.id}`, undefined, task.id), 404);
    status(await call(columnDetail.DELETE, 'DELETE', `/api/columns/${column.id}`, undefined, column.id), 200);
    const persisted = await board(project.id);
    assert.ok(!persisted.tasks.some((item) => item.id === task.id));
    assert.ok(!persisted.columns.some((item) => item.id === column.id));
  });
  await scenario('tarefa/coluna validam campos vazios e IDs inexistentes', async () => {
    status(await call(taskDetail.PATCH, 'PATCH', `/api/tasks/${missingId}`, { title: '   ' }), 400);
    status(await call(columnDetail.PATCH, 'PATCH', `/api/columns/${missingId}`, { name: '   ' }), 400);
    status(await call(taskDetail.PATCH, 'PATCH', `/api/tasks/${missingId}`, { title: `${prefix} válida` }), 404);
    status(await call(columnDetail.PATCH, 'PATCH', `/api/columns/${missingId}`, { name: `${prefix} válida` }), 404);
  });
  await createTask(otherProject.id, other.columns[0].id, 'tarefa para cascata');
  await scenario('excluir projeto remove também suas colunas e tarefas', async () => {
    status(await call(projectDetail.DELETE, 'DELETE', `/api/projects/${otherProject.id}`, undefined, otherProject.id), 200);
    status(await call(projectDetail.GET, 'GET', `/api/projects/${otherProject.id}`, undefined, otherProject.id), 404);
    const { rows: [counts] } = await pool.query(`SELECT
      (SELECT COUNT(*) FROM app_project_columns WHERE project_id = $1) AS columns,
      (SELECT COUNT(*) FROM app_project_tasks WHERE project_id = $1) AS tasks`, [otherProject.id]);
    assert.deepEqual(counts, { columns: '0', tasks: '0' });
  });

  // A criação normal depende de IA. Esta é a única origem direta de conteúdo;
  // leituras e alterações abaixo atravessam os handlers reais.
  const contentId = randomUUID();
  contents.add(contentId);
  await pool.query(`INSERT INTO app_contents (id, title, platform, theme, outline, relevance_score)
    VALUES ($1, $2, 'linkedin', 'QA sintético', 'Roteiro sintético', 75)`, [contentId, `${prefix} conteúdo`]);
  await scenario('conteúdo sintético aparece na listagem e no detalhe', async () => {
    const list = await call<Content[]>(contentList.GET, 'GET', `/api/contents?search=${encodeURIComponent(prefix)}`);
    status(list, 200);
    assert.equal(list.body.total, 1);
    const detail = await call<Content>(contentDetail.GET, 'GET', `/api/contents/${contentId}`, undefined, contentId);
    status(detail, 200);
    assert.equal(detail.body.data.title, `${prefix} conteúdo`);
  });
  await scenario('conteúdo persiste notas/rascunho/status e lista devolve o rascunho', async () => {
    const draft = `${prefix} texto de rascunho`;
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${contentId}`, { notes: 'Nota sintética', draft, status: 'rascunho' }, contentId), 200);
    const { rows: [saved] } = await pool.query('SELECT notes, draft, status FROM app_contents WHERE id = $1', [contentId]);
    assert.deepEqual(saved, { notes: 'Nota sintética', draft, status: 'rascunho' });
    const list = await call<Content[]>(contentList.GET, 'GET', `/api/contents?search=${encodeURIComponent(prefix)}`);
    assert.equal(list.body.data[0].draft, draft);
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${contentId}`, { notes: '', status: 'aprovado' }, contentId), 200);
    const detail = await call<Content>(contentDetail.GET, 'GET', `/api/contents/${contentId}`, undefined, contentId);
    assert.equal(detail.body.data.notes, '');
    assert.equal(detail.body.data.status, 'aprovado');
  });
  await scenario('conteúdo rejeita status inválido/corpo vazio e retorna 404 para ID ausente', async () => {
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${contentId}`, { status: 'inválido' }, contentId), 400);
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${contentId}`, {}, contentId), 400);
    status(await call(contentDetail.GET, 'GET', `/api/contents/${missingId}`), 404);
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${missingId}`, { notes: 'não deve persistir' }), 404);
  });

  const source = { sourceType: 'content', sourceId: contentId };
  const enrichmentPath = `/api/enrichment?sourceType=content&sourceId=${contentId}`;
  await scenario('enriquecimento vazio retorna null; notas/favorito são persistidos', async () => {
    const empty = await call<Enrichment | null>(enrichment.GET, 'GET', enrichmentPath);
    status(empty, 200);
    assert.equal(empty.body.data, null);
    status(await call(enrichment.PUT, 'PUT', '/api/enrichment', { ...source, notes: `${prefix} nota`, textOverride: `${prefix} texto`, interesting: true }), 200);
    const saved = await call<Enrichment>(enrichment.GET, 'GET', enrichmentPath);
    status(saved, 200);
    assert.equal(saved.body.data.notes, `${prefix} nota`);
    assert.equal(saved.body.data.interesting, true);
    assert.equal(saved.body.data.textOverride, `${prefix} texto`);
    const favorites = await call<Array<{ sourceId: string }>>(interesting.GET, 'GET', '/api/enrichment/interesting');
    status(favorites, 200);
    assert.ok(favorites.body.data.some((item) => item.sourceId === contentId));
  });
  await scenario('referência link cria, relê, exclui e deixa de aparecer', async () => {
    const result = await call<Reference>(reference.POST, 'POST', '/api/enrichment/reference', { ...source, kind: 'link', title: `${prefix} referência`, url: 'https://example.com/qa-api' });
    if (result.body.data?.id) references.add(result.body.data.id);
    status(result, 201);
    const id = result.body.data.id;
    const read = await call<Enrichment>(enrichment.GET, 'GET', enrichmentPath);
    assert.ok(read.body.data.references.some((item) => item.id === id && item.url === 'https://example.com/qa-api'));
    status(await call(reference.DELETE, 'DELETE', `/api/enrichment/reference?id=${id}`), 200);
    status(await call(reference.DELETE, 'DELETE', `/api/enrichment/reference?id=${id}`), 404);
    const after = await call<Enrichment>(enrichment.GET, 'GET', enrichmentPath);
    assert.equal(after.body.data.references.length, 0);
  });
  await scenario('enriquecimento limpa textos e desfavorita preservando os demais campos', async () => {
    status(await call(enrichment.PUT, 'PUT', '/api/enrichment', { ...source, notes: '' }), 200);
    const partial = await call<Enrichment>(enrichment.GET, 'GET', enrichmentPath);
    assert.equal(partial.body.data.notes, '');
    assert.equal(partial.body.data.interesting, true);
    assert.equal(partial.body.data.textOverride, `${prefix} texto`);
    status(await call(enrichment.PUT, 'PUT', '/api/enrichment', { ...source, interesting: false, textOverride: '' }), 200);
    const saved = await call<Enrichment>(enrichment.GET, 'GET', enrichmentPath);
    assert.equal(saved.body.data.interesting, false);
    assert.equal(saved.body.data.textOverride, '');
    const favorites = await call<Array<{ sourceId: string }>>(interesting.GET, 'GET', '/api/enrichment/interesting');
    assert.ok(!favorites.body.data.some((item) => item.sourceId === contentId));
  });
  await scenario('enriquecimento/referência rejeitam campos ausentes e referência inexistente', async () => {
    status(await call(enrichment.GET, 'GET', '/api/enrichment'), 400);
    status(await call(enrichment.PUT, 'PUT', '/api/enrichment', {}), 400);
    status(await call(reference.POST, 'POST', '/api/enrichment/reference', { ...source, kind: 'link', url: '' }), 400);
    status(await call(reference.DELETE, 'DELETE', '/api/enrichment/reference'), 400);
    status(await call(reference.DELETE, 'DELETE', `/api/enrichment/reference?id=${missingId}`), 404);
  });
  await scenario('conteúdo pode ser descartado', async () => {
    status(await call(contentDetail.PATCH, 'PATCH', `/api/contents/${contentId}`, { status: 'descartado' }, contentId), 200);
    const result = await call<Content>(contentDetail.GET, 'GET', `/api/contents/${contentId}`, undefined, contentId);
    assert.equal(result.body.data.status, 'descartado');
  });

  const conversationId = randomUUID();
  conversations.add(conversationId);
  await pool.query(`INSERT INTO conversations (id, title, date, source, status, transcription)
    VALUES ($1, $2, '2026-09-03', 'upload', 'pendente', 'Transcrição sintética para validar apenas a data.')`,
  [conversationId, `${prefix} data calendário`]);
  await scenario('conversa preserva data calendário no PATCH, banco e GET, inclusive DST', async () => {
    for (const date of ['2026-09-04', '2026-03-08', '2026-11-01']) {
      const saved = await call<{ date: string }>(conversationDetail.PATCH, 'PATCH', `/api/conversations/${conversationId}`, { date }, conversationId);
      status(saved, 200);
      assert.equal(saved.body.data.date.slice(0, 10), date);
      const { rows: [stored] } = await pool.query('SELECT date::text AS date FROM conversations WHERE id = $1', [conversationId]);
      assert.equal(stored.date, date);
      const read = await call<{ date: string }>(conversationDetail.GET, 'GET', `/api/conversations/${conversationId}`, undefined, conversationId);
      status(read, 200);
      assert.equal(read.body.data.date.slice(0, 10), date);
    }
  });
} finally {
  try { if (localDbConfirmed) await cleanup(); } finally {
    globalThis.fetch = originalFetch;
    await pool.end();
  }
}

console.log(`QA/API: ${passed} cenários PASS; ${failures.length} falha(s).`);
if (failures.length) process.exitCode = 1;
