import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { ingestPlaudFile, type IngestDeps } from '@/lib/plaud/ingest';

// fileId de teste — NÃO existe no Plaud real; injetamos deps mock.
const FILE_ID = 'ffffffffffffffffffffffffffffffff';

function makeDeps(over: Partial<{ transcript: string; summary: string; name: string; topics: string[] }>): IngestDeps {
  return {
    getFileContent: async () => ({
      file: { id: FILE_ID, name: over.name ?? 'Reunião Teste', created_at: '2026-01-10T12:00:00Z', start_at: '2026-01-10T12:00:00Z', duration: 720000 },
      transcript: over.transcript ?? 'transcrição integral de teste',
      summary: over.summary ?? 'resumo de teste',
      topics: over.topics ?? ['tópico A', 'tópico B'],
    }),
  };
}

async function cleanup() {
  await pool.query(`DELETE FROM meetings WHERE metadata->>'plaud_file_id' = $1`, [FILE_ID]);
}

async function main() {
  await cleanup();

  // 1) created
  let r = await ingestPlaudFile(FILE_ID, makeDeps({}));
  assert.equal(r.outcome, 'created', 'primeira ingestão deve criar');
  let m = (await pool.query(`SELECT status, transcription, transcription_length, metadata->>'plaud_file_id' pf FROM meetings WHERE id=$1`, [r.meetingId])).rows[0];
  assert.equal(m.status, 'received', 'status deve ser received');
  assert.equal(m.pf, FILE_ID, 'plaud_file_id deve estar no metadata');
  assert.equal(m.transcription_length, 'transcrição integral de teste'.length, 'length deve bater');
  let s = (await pool.query(`SELECT summary_text FROM summaries WHERE meeting_id=$1`, [r.meetingId])).rows;
  assert.equal(s.length, 1, 'deve ter 1 summary');
  const createdUpdatedAt = (await pool.query(`SELECT updated_at FROM meetings WHERE id=$1`, [r.meetingId])).rows[0].updated_at;

  // 2) skipped — mesmo conteúdo, nenhum write
  await new Promise((res) => setTimeout(res, 1100)); // garante que updated_at mudaria se houvesse write
  r = await ingestPlaudFile(FILE_ID, makeDeps({}));
  assert.equal(r.outcome, 'skipped', 'conteúdo idêntico deve pular');
  const afterSkip = (await pool.query(`SELECT updated_at FROM meetings WHERE id=$1`, [r.meetingId])).rows[0].updated_at;
  assert.equal(new Date(afterSkip).getTime(), new Date(createdUpdatedAt).getTime(), 'skip não deve tocar updated_at');

  // 3) updated — transcript mudou, status preservado
  await pool.query(`UPDATE meetings SET status='summarized' WHERE metadata->>'plaud_file_id'=$1`, [FILE_ID]);
  r = await ingestPlaudFile(FILE_ID, makeDeps({ transcript: 'nova transcrição corrigida' }));
  assert.equal(r.outcome, 'updated', 'conteúdo alterado deve atualizar');
  m = (await pool.query(`SELECT status, transcription FROM meetings WHERE id=$1`, [r.meetingId])).rows[0];
  assert.equal(m.status, 'summarized', 'update NÃO deve resetar status');
  assert.equal(m.transcription, 'nova transcrição corrigida', 'transcrição deve refletir a mudança');

  // 4) sem transcrição — skipped com reason
  await cleanup();
  r = await ingestPlaudFile(FILE_ID, makeDeps({ transcript: '' }));
  assert.equal(r.outcome, 'skipped', 'sem transcrição deve pular');
  assert.equal(r.reason, 'sem transcrição', 'reason deve explicar');
  const none = (await pool.query(`SELECT count(*)::int n FROM meetings WHERE metadata->>'plaud_file_id'=$1`, [FILE_ID])).rows[0].n;
  assert.equal(none, 0, 'nada deve ter sido criado');

  await cleanup();
  console.log('=== VERIFY ingest-one OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
