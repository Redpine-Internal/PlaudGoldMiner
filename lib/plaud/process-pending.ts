// Processa com IA as conversas que a ingestão deixou como 'pendente'
// (status 'received' em meetings). Mesmo pipeline de POST /api/process:
// 'processando' → processTranscription → persistTranscriptionResult /
// markConversationError. Falha individual NÃO derruba o lote — a conversa
// fica 'erro' e o loop continua (a reconciliação seguinte pode re-tentar
// manualmente via POST /api/process).

import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { processTranscription } from '@/lib/ai/services/transcription-processor';
import { persistTranscriptionResult, markConversationError } from '@/lib/ai/persist-result';

export interface ProcessPendingSummary {
  processed: number;
  failed: number;
}

type Processor = typeof processTranscription;
let processor: Processor = processTranscription;

export async function processPendingConversations(
  options?: { limit?: number; ids?: string[] }
): Promise<ProcessPendingSummary> {
  const filters = [eq(conversations.status, 'pendente'), isNotNull(conversations.transcription)];
  if (options?.ids?.length) filters.push(inArray(conversations.id, options.ids));

  const pending = await db
    .select({ id: conversations.id, title: conversations.title, transcription: conversations.transcription })
    .from(conversations)
    .where(and(...filters))
    .orderBy(asc(conversations.date))
    .limit(options?.limit ?? 500);

  const summary: ProcessPendingSummary = { processed: 0, failed: 0 };
  for (const conv of pending) {
    if (!conv.transcription) continue;
    try {
      await db.update(conversations).set({ status: 'processando' }).where(eq(conversations.id, conv.id));
      const result = await processor(conv.transcription);
      if (!result.success) {
        await markConversationError(conv.id);
        summary.failed += 1;
        console.error('[process-pending] IA falhou para', conv.id, result.error);
        continue;
      }
      await persistTranscriptionResult(conv.id, result.data, conv.title);
      summary.processed += 1;
    } catch (e) {
      await markConversationError(conv.id).catch(() => {});
      summary.failed += 1;
      console.error('[process-pending] erro em', conv.id, e);
    }
  }
  return summary;
}

// Só para scripts de verificação (injeta o processador para não chamar a IA real).
export const __testing = {
  setProcessor(fn: Processor) { processor = fn; },
  reset() { processor = processTranscription; },
};
