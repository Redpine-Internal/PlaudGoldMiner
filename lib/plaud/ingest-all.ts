// Varredura completa do Plaud: pagina listFiles, ingere cada gravação
// (idempotente), registra a execução em app_ingest_runs e, ao final,
// processa com IA as conversas que ficaram pendentes (D2).
// Compartilhado por POST /api/plaud/ingest (cron, com segredo) e
// POST /api/plaud/sync (botão da UI).

import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError } from '@/lib/plaud/tokens';
import { pool } from '@/lib/db';
import { ingestPlaudFile, stagePlaudFile, type PlaudFileStageResult } from '@/lib/plaud/ingest';
import { processPendingConversations, type ProcessPendingSummary } from '@/lib/plaud/process-pending';
import { startIngestRun, finishIngestRun, type IngestSummary } from '@/lib/plaud/run-log';

export interface FullIngestResult {
  ingest: IngestSummary;
  processing: ProcessPendingSummary;
}

/** Erro com o resumo parcial da varredura (para a rota devolver `partial`). */
export class IngestRunError extends Error {
  constructor(message: string, readonly partial: IngestSummary, readonly cause?: unknown) {
    super(message);
    this.name = 'IngestRunError';
  }
}

export class IngestAlreadyRunningError extends Error {
  constructor() {
    super('Já existe uma sincronização do Plaud em andamento.');
    this.name = 'IngestAlreadyRunningError';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ingestIntervalMs(): number {
  const configured = Number(process.env.PLAUD_INGEST_MIN_INTERVAL_MS ?? '1200');
  return Number.isFinite(configured) && configured >= 0 ? configured : 1200;
}

export async function runFullIngest(trigger: 'manual' | 'cron', maxPages?: number): Promise<FullIngestResult> {
  const lockClient = await pool.connect();
  const lockResult = await lockClient.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext('plaud-full-ingest')) AS locked`
  );
  if (!lockResult.rows[0]?.locked) {
    lockClient.release();
    throw new IngestAlreadyRunningError();
  }

  const summary: IngestSummary = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    awaitingTranscription: 0,
    errors: [],
  };
  const pageSize = 50;
  let runId: string | null = null;

  try {
    runId = await startIngestRun(trigger);
    const stagedFiles: PlaudFileStageResult[] = [];
    let page = 1;
    while (true) {
      if (maxPages && page > maxPages) break;
      const { data } = await listFiles(page, pageSize);
      if (!data.length) break;

      for (const file of data) {
        summary.total += 1;
        try {
          stagedFiles.push(await stagePlaudFile(file));
        } catch (e) {
          summary.errors.push({ fileId: file.id, message: e instanceof Error ? e.message : String(e) });
        }
      }

      if (data.length < pageSize) break; // última página
      page += 1;
    }

    let lastDetailRequestAt = 0;
    for (const staged of stagedFiles) {
      let outcome = staged.outcome;

      if (staged.needsContent) {
        const remainingWait = ingestIntervalMs() - (Date.now() - lastDetailRequestAt);
        if (remainingWait > 0) await wait(remainingWait);
        lastDetailRequestAt = Date.now();

        try {
          const contentResult = await ingestPlaudFile(staged.fileId);
          if (contentResult.reason === 'aguardando transcrição do Plaud') {
            summary.awaitingTranscription += 1;
          }
          if (outcome !== 'created' && contentResult.outcome === 'updated') {
            outcome = 'updated';
          }
        } catch (error) {
          if (error instanceof PlaudAuthError) throw error;
          summary.awaitingTranscription += 1;
          summary.errors.push({
            fileId: staged.fileId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (outcome === 'created') summary.created += 1;
      else if (outcome === 'updated') summary.updated += 1;
      else summary.skipped += 1;
    }

    const processing = await processPendingConversations();
    await finishIngestRun(runId, { ok: summary.errors.length === 0, summary, processing });
    return { ingest: summary, processing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      await finishIngestRun(runId, { ok: false, summary, errorMessage: message }).catch(() => {});
    }
    throw new IngestRunError(message, summary, error);
  } finally {
    await lockClient.query(`SELECT pg_advisory_unlock(hashtext('plaud-full-ingest'))`).catch(() => {});
    lockClient.release();
  }
}
