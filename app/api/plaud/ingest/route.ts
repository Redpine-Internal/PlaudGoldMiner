import { NextRequest } from 'next/server';
import { z } from 'zod';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { runFullIngest, IngestRunError } from '@/lib/plaud/ingest-all';

const bodySchema = z.object({
  maxPages: z.number().int().positive().max(1000).optional(),
}).optional();

/**
 * Ingestão em lote (cron/operador): varre listFiles (paginado), deposita cada
 * gravação em meetings/summaries via ingestPlaudFile (idempotente) e processa
 * com IA as conversas pendentes ao final. Protegida por INGEST_CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  // Guard: a rota varre o Plaud inteiro — só o operador/cron pode disparar.
  const secret = process.env.INGEST_CRON_SECRET;
  const provided = request.headers.get('x-ingest-secret');
  if (secret && provided !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const trigger: 'manual' | 'cron' = request.headers.get('x-ingest-trigger') === 'cron' ? 'cron' : 'manual';

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

  try {
    const result = await runFullIngest(trigger, maxPages);
    return Response.json({ data: result });
  } catch (error) {
    const cause = error instanceof IngestRunError ? error.cause : error;
    if (cause instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/ingest auth error:', cause);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/ingest error:', error);
    return Response.json(
      { error: 'Internal server error', partial: error instanceof IngestRunError ? error.partial : undefined },
      { status: 500 }
    );
  }
}
