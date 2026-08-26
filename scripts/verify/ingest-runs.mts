import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { startIngestRun, finishIngestRun } from '@/lib/plaud/run-log';

async function main() {
  const id = await startIngestRun('manual');
  assert.ok(id, 'deve devolver id do run');
  await finishIngestRun(id, {
    ok: true,
    summary: { total: 3, created: 1, updated: 1, skipped: 1, errors: [{ fileId: 'x', message: 'boom' }] },
    processing: { processed: 1, failed: 0 },
  });
  const row = (await pool.query(`SELECT * FROM app_ingest_runs WHERE id=$1`, [id])).rows[0];
  assert.equal(row.ok, true);
  assert.equal(row.total, 3);
  assert.equal(row.created, 1);
  assert.equal(row.processed, 1);
  assert.equal(row.process_failed, 0);
  assert.ok(row.finished_at, 'finished_at preenchido');
  assert.equal(JSON.parse(JSON.stringify(row.errors))[0].fileId, 'x');
  await pool.query(`DELETE FROM app_ingest_runs WHERE id=$1`, [id]);
  console.log('=== VERIFY ingest-runs OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
