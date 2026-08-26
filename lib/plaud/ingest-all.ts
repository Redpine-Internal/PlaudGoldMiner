// Varredura completa do Plaud: pagina listFiles, ingere cada gravação
// (idempotente), registra a execução em app_ingest_runs e, ao final,
// processa com IA as conversas que ficaram pendentes (D2).
// Compartilhado por POST /api/plaud/ingest (cron, com segredo) e
// POST /api/plaud/sync (botão da UI).

import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError } from '@/lib/plaud/tokens';
import { ingestPlaudFile } from '@/lib/plaud/ingest';
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

export async function runFullIngest(trigger: 'manual' | 'cron', maxPages?: number): Promise<FullIngestResult> {
  const runId = await startIngestRun(trigger);
  const summary: IngestSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
  const pageSize = 50;

  try {
    let page = 1;
    while (true) {
      if (maxPages && page > maxPages) break;
      const { data } = await listFiles(page, pageSize);
      if (!data.length) break;

      for (const file of data) {
        summary.total += 1;
        try {
          const r = await ingestPlaudFile(file.id);
          if (r.outcome === 'created') summary.created += 1;
          else if (r.outcome === 'updated') summary.updated += 1;
          else summary.skipped += 1;
        } catch (e) {
          // Auth falhou no meio do lote: vai falhar para todos os próximos. Aborta.
          if (e instanceof PlaudAuthError) throw e;
          summary.errors.push({ fileId: file.id, message: e instanceof Error ? e.message : String(e) });
        }
      }

      if (data.length < pageSize) break; // última página
      page += 1;
    }

    const processing = await processPendingConversations();
    await finishIngestRun(runId, { ok: summary.errors.length === 0, summary, processing });
    return { ingest: summary, processing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishIngestRun(runId, { ok: false, summary, errorMessage: message }).catch(() => {});
    throw new IngestRunError(message, summary, error);
  }
}
