import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';
import { runFullIngest, IngestRunError } from '@/lib/plaud/ingest-all';

/**
 * Sincronização manual disparada pelo botão da UI. Mesma varredura da rota
 * de ingestão, sem segredo (o segredo do cron não pode ir para o client).
 */
export async function POST() {
  try {
    const result = await runFullIngest('manual');
    return Response.json({ data: result });
  } catch (error) {
    const cause = error instanceof IngestRunError ? error.cause : error;
    if (cause instanceof PlaudAuthError) {
      console.error('[API] POST /api/plaud/sync auth error:', cause);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] POST /api/plaud/sync error:', error);
    return Response.json(
      { error: 'Internal server error', partial: error instanceof IngestRunError ? error.partial : undefined },
      { status: 500 }
    );
  }
}
