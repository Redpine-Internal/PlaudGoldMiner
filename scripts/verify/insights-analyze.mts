import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';

async function main() {
  const res = await fetch('http://localhost:3000/api/insights/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: '2026-07-01' }),
  });
  assert.equal(res.status, 200, `HTTP ${res.status}`);
  const body = await res.json();
  assert.ok(body.summary.conversationsAnalyzed >= 2);
  const ids = body.data.map((i: { id: string }) => i.id);
  assert.ok(ids.length > 0, 'gerou insights');

  for (const id of ids) {
    const row = (await pool.query(
      `SELECT pattern, frequency, analyzed_count, evidence, is_hypothesis FROM app_cross_insights WHERE id=$1`, [id]
    )).rows[0];
    assert.match(row.pattern, /^\d+ de \d+ conversas \(\d+%\)$/, `pattern legível: ${row.pattern}`);
    assert.ok(row.analyzed_count >= 2, 'analyzed_count persistido');
    assert.ok(Array.isArray(row.evidence), 'evidence é array jsonb');
    const links = await pool.query(
      `SELECT count(*)::int AS n FROM app_cross_insight_conversations WHERE cross_insight_id=$1`, [id]
    );
    assert.ok(links.rows[0].n >= 0, 'M:N consultável');
  }

  // Limpeza: remove os insights gerados pelo teste.
  await pool.query(`DELETE FROM app_cross_insight_conversations WHERE cross_insight_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM app_cross_insights WHERE id = ANY($1)`, [ids]);
  console.log('=== VERIFY insights-analyze OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
