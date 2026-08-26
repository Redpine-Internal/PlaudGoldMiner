import 'dotenv/config';
import assert from 'node:assert/strict';
import { pool } from '@/lib/db';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processPendingConversations, __testing } from '@/lib/plaud/process-pending';
import type { TranscriptionResult } from '@/lib/ai/prompts/process-transcription';

const FAKE_RESULT: TranscriptionResult = {
  summary: 'Resumo de teste',
  topics: ['teste'],
  participants: [],
  suggestedTitle: 'Título de teste',
  suggestedType: 'reuniao',
  opportunities: [],
  problems: [],
} as TranscriptionResult;

async function main() {
  const id = crypto.randomUUID();
  await db.insert(conversations).values({
    id,
    title: 'VERIFY process-pending',
    date: new Date(),
    type: 'reuniao',
    status: 'pendente',
    transcription: 'Transcrição sintética para o verify.',
    source: 'seed',
  });

  // Sucesso: pendente → processado, summary persistido.
  __testing.setProcessor(async () => ({ success: true, data: FAKE_RESULT }));
  const ok = await processPendingConversations({ ids: [id] });
  assert.equal(ok.processed, 1);
  assert.equal(ok.failed, 0);
  let [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  assert.equal(row.status, 'processado');
  assert.equal(row.summary, 'Resumo de teste');

  // Falha: volta para pendente, processador falha → erro, e a função NÃO lança.
  await db.update(conversations).set({ status: 'pendente' }).where(eq(conversations.id, id));
  __testing.setProcessor(async () => ({
    success: false,
    error: { code: 'API_ERROR', message: 'boom' },
  }));
  const fail = await processPendingConversations({ ids: [id] });
  assert.equal(fail.processed, 0);
  assert.equal(fail.failed, 1);
  [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  assert.equal(row.status, 'erro');

  __testing.reset();
  await db.delete(conversations).where(eq(conversations.id, id));
  console.log('=== VERIFY process-pending OK ===');
  await pool.end();
}
main().catch(async (e) => { console.error('VERIFY FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
