import { NextRequest } from 'next/server';
import { z } from 'zod';
import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { ingestPlaudFile } from '@/lib/plaud/ingest';

const bodySchema = z.object({
  maxPages: z.number().int().positive().max(1000).optional(),
}).optional();

/**
 * Ingestão em lote manual: varre listFiles (paginado) e deposita cada gravação
 * em meetings/summaries via ingestPlaudFile (idempotente). NÃO roda IA.
 */
export async function POST(request: NextRequest) {
  let maxPages: number | undefined;
  try {
    const raw = await request.json().catch(() => ({}));
    maxPages = bodySchema.parse(raw)?.maxPages;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })) },
        { status: 400 }
      );
    }
    throw error; // não-Zod: deixa o handler externo tratar (não engolir silenciosamente)
  }

  const summary = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] as { fileId: string; message: string }[] };
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
          // Auth falhou no meio do lote: vai falhar para todos os próximos.
          // Aborta e deixa o handler externo devolver 401 (sem vazar caminho/email do token).
          if (e instanceof PlaudAuthError) throw e;
          summary.errors.push({ fileId: file.id, message: e instanceof Error ? e.message : String(e) });
        }
      }

      if (data.length < pageSize) break; // última página
      page += 1;
    }

    return Response.json({ data: summary });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/ingest auth error:', error);
      return Response.json(
        { error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' },
        { status: 401 }
      );
    }
    console.error('[API] POST /api/plaud/ingest error:', error);
    return Response.json({ error: 'Internal server error', partial: summary }, { status: 500 });
  }
}
