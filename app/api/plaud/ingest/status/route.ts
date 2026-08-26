import { pool } from '@/lib/db';
import { listFiles } from '@/lib/plaud/client';
import { PlaudAuthError, PLAUD_AUTH_CLIENT_MESSAGE } from '@/lib/plaud/tokens';

/**
 * Observabilidade da ingestão: quantas gravações existem no Plaud, quantas já
 * estão no banco, quais faltam (o "gap" que deveria ser sempre 0) e as últimas
 * execuções de ingestão.
 */
export async function GET() {
  try {
    // IDs no Plaud (paginado).
    const plaudIds = new Set<string>();
    let page = 1;
    const pageSize = 50;
    while (true) {
      const { data } = await listFiles(page, pageSize);
      for (const f of data) plaudIds.add(f.id);
      if (data.length < pageSize) break;
      page += 1;
    }

    // IDs já no banco.
    const dbRes = await pool.query<{ pf: string }>(
      `SELECT metadata->>'plaud_file_id' AS pf FROM meetings WHERE metadata->>'plaud_file_id' IS NOT NULL`
    );
    const dbIds = new Set(dbRes.rows.map((r) => r.pf));
    const missing = [...plaudIds].filter((id) => !dbIds.has(id));

    const runs = await pool.query(
      `SELECT id, trigger, started_at, finished_at, ok, total, created, updated, skipped,
              processed, process_failed, jsonb_array_length(errors) AS error_count, error_message
         FROM app_ingest_runs ORDER BY started_at DESC LIMIT 10`
    );

    return Response.json({
      data: {
        plaudTotal: plaudIds.size,
        inDatabase: dbIds.size,
        missingCount: missing.length,
        missingIds: missing,
        lastRuns: runs.rows,
      },
    });
  } catch (error) {
    if (error instanceof PlaudAuthError) {
      console.error('[API] GET /api/plaud/ingest/status auth error:', error);
      return Response.json({ error: PLAUD_AUTH_CLIENT_MESSAGE, code: 'plaud_auth' }, { status: 401 });
    }
    console.error('[API] GET /api/plaud/ingest/status error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
