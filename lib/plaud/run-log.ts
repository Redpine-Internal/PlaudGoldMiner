import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';

export interface IngestSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { fileId: string; message: string }[];
}

export async function startIngestRun(trigger: 'manual' | 'cron'): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO app_ingest_runs (id, trigger) VALUES ($1, $2)`, [id, trigger]);
  return id;
}

export async function finishIngestRun(
  id: string,
  result: {
    ok: boolean;
    summary: IngestSummary;
    processing?: { processed: number; failed: number };
    errorMessage?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE app_ingest_runs
        SET finished_at=now(), ok=$2, total=$3, created=$4, updated=$5, skipped=$6,
            processed=$7, process_failed=$8, errors=$9::jsonb, error_message=$10
      WHERE id=$1`,
    [id, result.ok, result.summary.total, result.summary.created, result.summary.updated,
      result.summary.skipped, result.processing?.processed ?? 0, result.processing?.failed ?? 0,
      JSON.stringify(result.summary.errors), result.errorMessage ?? null]
  );
}
