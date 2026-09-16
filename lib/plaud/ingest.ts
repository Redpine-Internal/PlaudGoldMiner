import { pool } from '@/lib/db';
import { getFileContent, type PlaudFile } from '@/lib/plaud/client';

export type IngestOutcome = 'created' | 'updated' | 'skipped';

export interface IngestResult {
  fileId: string;
  meetingId: string;
  outcome: IngestOutcome;
  reason?: string;
}

export interface PlaudFileStageResult extends IngestResult {
  needsContent: boolean;
}

// Injeção de dependência para testar sem bater no Plaud real.
export interface IngestDeps {
  getFileContent: typeof getFileContent;
}
const defaultDeps: IngestDeps = { getFileContent };

/**
 * Chave de idempotência da ingestão.
 *
 * Em setembro/2026 o Plaud passou a prefixar os ids de arquivo com `of_`. Como a
 * comparação era por igualdade de string, nenhum registro existente foi
 * reconhecido e uma única varredura recriou o acervo inteiro (314 conversas
 * duplicadas). O prefixo é wire format, não identidade: a chave é o id nu.
 *
 * Toda leitura e toda escrita de `metadata->>'plaud_file_id'` passa por aqui.
 */
export function normalizePlaudFileId(id: string): string {
  return id.replace(/^of_/, '');
}

/** Data do Plaud -> 'YYYY-MM-DD' (coluna meetings.meeting_date é DATE). null se inválida. */
function toDateOnly(...candidates: string[]): string | null {
  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Garante que toda gravação listada pelo Plaud exista no acervo, mesmo quando
 * o Plaud ainda não produziu a transcrição. O texto vazio é o estado pendente
 * compatível com a coluna NOT NULL de meetings; a UI o traduz para
 * "Aguardando transcrição do Plaud".
 */
export async function stagePlaudFile(file: PlaudFile): Promise<PlaudFileStageResult> {
  const title = file.name || 'Conversa do Plaud';
  const meetingDate = toDateOnly(file.start_at || '', file.created_at || '');
  const duration = file.duration ?? null;
  const normalizedFileId = normalizePlaudFileId(file.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // O lock precisa usar a chave normalizada: 'of_X' e 'X' são a mesma gravação
    // e gerariam locks distintos, sem proteger contra a corrida.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 42))`, [normalizedFileId]);

    const existing = await client.query(
      `SELECT m.id, m.title, m.transcription, m.meeting_date::text AS meeting_date,
              m.metadata->>'duration' AS duration
         FROM meetings m
        WHERE regexp_replace(m.metadata->>'plaud_file_id', '^of_', '') = $1
        LIMIT 1`,
      [normalizedFileId]
    );

    if (existing.rowCount === 0) {
      const inserted = await client.query(
        `INSERT INTO meetings
           (title, transcription, transcription_length, meeting_date, participants,
            source, status, metadata)
         VALUES ($1,'',0,$2,'[]'::jsonb,'plaud','received',
            jsonb_strip_nulls(jsonb_build_object(
              'plaud_file_id',$3::text,'duration',$4::numeric,'type','nao_classificado',
              'plaud_transcription_status','pending')))
         RETURNING id`,
        [title, meetingDate, normalizedFileId, duration]
      );
      await client.query('COMMIT');
      return {
        fileId: file.id,
        meetingId: inserted.rows[0].id as string,
        outcome: 'created',
        reason: 'aguardando transcrição do Plaud',
        needsContent: true,
      };
    }

    const row = existing.rows[0];
    const hasTranscription = Boolean((row.transcription ?? '').trim());
    const metadataChanged =
      (row.title ?? '') !== title ||
      (row.meeting_date ?? null) !== meetingDate ||
      String(row.duration ?? '') !== String(duration ?? '');

    if (metadataChanged) {
      await client.query(
        `UPDATE meetings SET
           title=$2,
           meeting_date=$3,
           metadata=metadata || jsonb_strip_nulls(jsonb_build_object(
             'duration',$4::numeric,'plaud_transcription_status',$5::text)),
           updated_at=now()
         WHERE id=$1`,
        [row.id, title, meetingDate, duration, hasTranscription ? 'ready' : 'pending']
      );
    }

    await client.query('COMMIT');
    return {
      fileId: file.id,
      meetingId: row.id as string,
      outcome: metadataChanged ? 'updated' : 'skipped',
      reason: hasTranscription ? undefined : 'aguardando transcrição do Plaud',
      needsContent: !hasTranscription,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  const staged = await stagePlaudFile(file);

  if (!transcript || transcript.trim().length === 0) {
    return {
      fileId,
      meetingId: staged.meetingId,
      outcome: staged.outcome,
      reason: 'aguardando transcrição do Plaud',
    };
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
        WHERE regexp_replace(m.metadata->>'plaud_file_id', '^of_', '') = $1
        LIMIT 1`,
      [normalizePlaudFileId(fileId)]
    );

    if (existing.rowCount === 0) {
      // CREATE
      const ins = await client.query(
        `INSERT INTO meetings
           (title, transcription, transcription_length, meeting_date, participants,
            source, status, metadata)
         VALUES ($1,$2,$3,$4,'[]'::jsonb,'plaud','received',
            jsonb_strip_nulls(jsonb_build_object(
              'plaud_file_id',$5::text,'duration',$6::numeric,'type','nao_classificado','topics',$7::jsonb)))
         RETURNING id`,
        [title, transcript, transcript.length, meetingDate, normalizePlaudFileId(fileId),
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
      return { fileId, meetingId, outcome: staged.outcome };
    }

    // Atualiza só o que mudou; NÃO toca em status. metadata mesclado (topics/duration).
    await client.query(
      `UPDATE meetings SET
         title = $2,
         transcription = $3,
         transcription_length = $4,
         meeting_date = $5,
         metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
           'duration', $6::numeric, 'topics', $7::jsonb,
           'plaud_transcription_status', 'ready')),
         status = CASE
           WHEN NULLIF(btrim(transcription), '') IS NULL THEN 'received'
           ELSE status
         END,
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
    return {
      fileId,
      meetingId,
      outcome: staged.outcome === 'created' ? 'created' : 'updated',
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
