/**
 * node --import tsx scripts/qa/sql-contracts.mts
 *
 * Verifica os SELECTs reais de idea/analyze no PostgreSQL isolado de QA.
 * Não importa handlers, não gera IA, não carrega .env e não grava dados.
 * O SQL vem da AST das rotas; só literais/interpolações constantes são aceitos.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import ts from 'typescript';

interface CapturedQuery {
  file: string;
  line: number;
  sql: string;
}

async function captureSelects(file: string): Promise<CapturedQuery[]> {
  const contents = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
  const constants = new Map<string, ts.Expression>();
  const queries: CapturedQuery[] = [];

  function collectConstants(node: ts.Node) {
    if (ts.isVariableDeclarationList(node) && node.flags & ts.NodeFlags.Const) {
      for (const declaration of node.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    ts.forEachChild(node, collectConstants);
  }
  collectConstants(source);

  function literal(node: ts.Expression, resolving = new Set<string>()): string {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans
        .map((span) => literal(span.expression, resolving) + span.literal.text)
        .join('');
    }
    if (ts.isIdentifier(node) && constants.has(node.text) && !resolving.has(node.text)) {
      return literal(constants.get(node.text)!, new Set([...resolving, node.text]));
    }
    throw new Error(`${file}: SQL não estático ou interpolação desconhecida: ${node.getText(source)}`);
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'pool'
      && node.expression.name.text === 'query') {
      assert.ok(node.arguments[0], `${file}: pool.query sem SQL`);
      const sql = literal(node.arguments[0]);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (/^\s*SELECT\b/i.test(sql)) {
        assert.ok(!sql.includes(';'), `${file}:${line}: somente um SELECT por chamada`);
        queries.push({ file, line, sql });
      } else {
        console.log(`IGNORADO (não é SELECT): ${file}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return queries;
}

const ideaFile = 'app/api/opportunities/idea/route.ts';
const analyzeFile = 'app/api/opportunities/analyze/route.ts';
const queries = [
  ...await captureSelects(ideaFile),
  ...await captureSelects(analyzeFile),
];
const conversationId = '00000000-0000-4000-8000-000000000001';
const cases: Array<{ name: string; file: string; match: string; params: unknown[] }> = [
  { name: 'ideia: oportunidade e conversa', file: ideaFile, match: 'WHERE o.id = $1', params: ['qa-sql-contract-opportunity'] },
  { name: 'análise: período', file: analyzeFile, match: 'c.date >= $1', params: ['2000-01-01', '2000-01-31'] },
  { name: 'análise: seleção', file: analyzeFile, match: 'c.id = ANY(', params: [[conversationId]] },
  { name: 'análise: conversa única', file: analyzeFile, match: 'c.id = $1', params: [conversationId] },
  { name: 'análise: pendentes', file: analyzeFile, match: 'NOT EXISTS', params: [] },
  { name: 'análise: deduplicação', file: analyzeFile, match: 'SELECT DISTINCT o.title', params: [[conversationId]] },
];
assert.equal(queries.length, cases.length, 'Toda consulta SELECT precisa de um cenário de verificação');
const matched = new Set<CapturedQuery>();

// Destino deliberadamente fixo: variáveis DATABASE_URL/PGHOST e .env não podem
// redirecionar a verificação. O servidor também proíbe escrita nesta conexão.
const client = new pg.Client({
  host: '127.0.0.1',
  port: 55432,
  database: 'pgm_qa',
  user: 'pgm_qa',
  password: '',
  ssl: false,
  options: '-c default_transaction_read_only=on',
  connectionTimeoutMillis: 5_000,
  statement_timeout: 5_000,
});

try {
  await client.connect();
  const { rows: [identity] } = await client.query(`
    SELECT current_database() AS db, current_user AS username,
           host(inet_server_addr()) AS host, inet_server_port() AS port,
           current_setting('transaction_read_only') AS read_only
  `);
  assert.deepEqual(identity, {
    db: 'pgm_qa', username: 'pgm_qa', host: '127.0.0.1', port: 55432, read_only: 'on',
  }, 'Identidade/proteção read-only do PostgreSQL isolado não confirmada');

  const { rows: types } = await client.query(`
    SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND (table_name, column_name) IN (
       ('conversations', 'id'), ('app_opportunities', 'conversation_id'),
       ('app_opportunity_sources', 'conversation_id')
     ) ORDER BY table_name
  `);
  assert.deepEqual(types, [
    { table_name: 'app_opportunities', column_name: 'conversation_id', data_type: 'uuid' },
    { table_name: 'app_opportunity_sources', column_name: 'conversation_id', data_type: 'text' },
    { table_name: 'conversations', column_name: 'id', data_type: 'uuid' },
  ], 'A estrutura local diverge dos tipos físicos homologados');
  console.log('PostgreSQL isolado confirmado: conversas UUID, oportunidades UUID, fontes text; read-only ativo.');

  for (const scenario of cases) {
    const candidates = queries.filter((query) => query.file === scenario.file && query.sql.includes(scenario.match));
    assert.equal(candidates.length, 1, `${scenario.name}: consulta ausente ou ambígua`);
    const query = candidates[0];
    assert.ok(!matched.has(query), `${scenario.name}: consulta já coberta por outro cenário`);
    matched.add(query);
    // Sem ANALYZE: planeja o SQL real com parâmetros, mas não executa o handler
    // nem percorre dados/aciona a geração e a persistência da análise.
    const result = await client.query<{ 'QUERY PLAN': Array<{ Plan: unknown }> }>(
      `EXPLAIN (FORMAT JSON) ${query.sql}`, scenario.params
    );
    assert.ok(result.rows[0]?.['QUERY PLAN']?.[0]?.Plan, `${scenario.name}: plano ausente`);
    console.log(`PASS ${scenario.name} — ${query.file}:${query.line}`);
  }
  assert.equal(matched.size, queries.length, 'SELECT sem cobertura');
  console.log(`PASS ${matched.size} consultas reais. Nenhuma incompatibilidade UUID/text demonstrada.`);
} finally {
  await client.end();
}
