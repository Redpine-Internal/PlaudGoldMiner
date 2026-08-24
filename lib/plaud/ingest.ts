import { pool } from '@/lib/db';
import { getFileContent } from '@/lib/plaud/client';

export type IngestOutcome = 'created' | 'updated' | 'skipped';

export interface IngestResult {
  fileId: string;
  meetingId: string;
  outcome: IngestOutcome;
  reason?: string;
}

// Injeção de dependência para testar sem bater no Plaud real.
export interface IngestDeps {
  getFileContent: typeof getFileContent;
}
const defaultDeps: IngestDeps = { getFileContent };

/** Data do Plaud -> 'YYYY-MM-DD' (coluna meetings.meeting_date é DATE). null se inválida. */
function toDateOnly(...candidates: string[]): string | null {
  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Deposita UMA gravação do Plaud em meetings/summaries. Idempotente por
 * metadata->>'plaud_file_id': cria se novo, atualiza só se o conteúdo do Plaud
 * mudou (preservando status), pula se idêntico. NÃO roda IA.
 */
export async function ingestPlaudFile(
  fileId: string,
  deps: IngestDeps = defaultDeps
): Promise<IngestResult> {
  const { file, transcript, summary, topics } = await deps.getFileContent(fileId);

  if (!transcript || transcript.trim().length === 0) {
    return { fileId, meetingId: '', outcome: 'skipped', reason: 'sem transcrição' };
  }

  const title = file.name || 'Conversa do Plaud';
  const meetingDate = toDateOnly(file.start_at || '', file.created_at || '');
  const topicsJson = topics.length ? JSON.stringify(topics) : null;
  const cleanSummary = (summary || '').trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT m.id, m.title, m.transcription, m.meeting_date::text AS meeting_date,
              s.summary_text
         FROM meetings m
         LEFT JOIN LATERAL (
           SELECT summary_text FROM summaries s2
           WHERE s2.meeting_id = m.id ORDER BY s2.created_at DESC LIMIT 1
         ) s ON true
        WHERE m.metadata->>'plaud_file_id' = $1
        LIMIT 1`,
      [fileId]
    );

    if (existing.rowCount === 0) {
      // CREATE
      const ins = await client.query(
        `INSERT INTO meetings
           (title, transcription, transcription_length, meeting_date, participants,
            source, status, metadata)
         VALUES ($1,$2,$3,$4,'[]'::jsonb,'plaud','received',
            jsonb_strip_nulls(jsonb_build_object(
              'plaud_file_id',$5::text,'duration',$6::numeric,'type','reuniao','topics',$7::jsonb)))
         RETURNING id`,
        [title, transcript, transcript.length, meetingDate, fileId,
         file.duration ?? null, topicsJson]
      );
      const meetingId = ins.rows[0].id as string;
      if (cleanSummary) {
        await client.query(
          `INSERT INTO summaries (meeting_id, summary_text) VALUES ($1,$2)`,
          [meetingId, cleanSummary]
        );
      }
      await client.query('COMMIT');
      return { fileId, meetingId, outcome: 'created' };
    }

    // UPDATE condicional
    const row = existing.rows[0];
    const meetingId = row.id as string;
    const titleChanged = (row.title ?? '') !== title;
    const transcriptChanged = (row.transcription ?? '') !== transcript;
    const dateChanged = (row.meeting_date ?? null) !== meetingDate;
    const summaryChanged = ((row.summary_text ?? '') || '').trim() !== cleanSummary;

    if (!titleChanged && !transcriptChanged && !dateChanged && !summaryChanged) {
      await client.query('COMMIT');
      return { fileId, meetingId, outcome: 'skipped' };
    }

    // Atualiza só o que mudou; NÃO toca em status. metadata mesclado (topics/duration).
    await client.query(
      `UPDATE meetings SET
         title = $2,
         transcription = $3,
         transcription_length = $4,
         meeting_date = $5,
         metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
           'duration', $6::numeric, 'type', 'reuniao', 'topics', $7::jsonb)),
         updated_at = now()
       WHERE id = $1`,
      [meetingId, title, transcript, transcript.length, meetingDate,
       file.duration ?? null, topicsJson]
    );

    if (summaryChanged && cleanSummary) {
      const hasSummary = await client.query(
        `SELECT id FROM summaries WHERE meeting_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [meetingId]
      );
      if (hasSummary.rowCount && hasSummary.rowCount > 0) {
        await client.query(`UPDATE summaries SET summary_text=$2 WHERE id=$1`,
          [hasSummary.rows[0].id, cleanSummary]);
      } else {
        await client.query(`INSERT INTO summaries (meeting_id, summary_text) VALUES ($1,$2)`,
          [meetingId, cleanSummary]);
      }
    }

    await client.query('COMMIT');
    return { fileId, meetingId, outcome: 'updated' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
