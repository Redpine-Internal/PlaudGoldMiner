// Etapa pós-varredura: classifica de que lado está cada falante das conversas
// que ainda não têm essa leitura. Roda depois do commit da ingestão, junto de
// processPendingConversations, e nunca dentro da transação de uma gravação.
//
// Saber quem fala o quê é pré-requisito da qualificação: "a gente tem
// dificuldade com terceiros" é dor quando vem do cliente e é pitch quando vem
// da consultoria. Sem o lado, as duas frases são a mesma.

import { pool } from '@/lib/db';
import { classifyConversationSides } from '@/lib/conversations/classify-sides';
import { isTypeSafeConfigured } from '@/lib/ai/typesafe-client';
import { miningEligibleSql } from '@/lib/conversations/classification';
import { SPEAKER_SIDES_VERSION, type StoredSpeakerSides } from '@/lib/conversations/speaker-sides-store';

export interface ClassifySidesSummary {
  classified: number;
  skipped: number;
  failed: number;
  /** Conversas que ficaram acima do limite de fala indeterminada. */
  unusable: number;
}

/**
 * Teto por execução. A varredura já é a parte lenta da ingestão; classificar
 * tudo que faltar numa única passada faria uma conversa nova esperar o acervo
 * inteiro. O que sobra fica para a próxima — `needsClassification` continua
 * verdadeiro, então nada se perde.
 */
const MAX_POR_EXECUCAO = 25;

/**
 * Conversas que faltam classificar.
 *
 * Restringe ao que a mineração de fato usa — a elegibilidade vem de
 * `miningEligibleSql`, não de uma lista repetida aqui: classificar o lado dos
 * falantes de uma palestra é gastar chamada num material que nunca vira
 * negócio, e uma segunda cópia da regra divergiria em silêncio no dia em que a
 * primeira mudar.
 *
 * Exige marcação de falante na transcrição, porque sem ela não há o que
 * separar.
 */
async function pendingMeetingIds(limit: number): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT m.id
       FROM meetings m
      WHERE m.transcription IS NOT NULL
        AND btrim(m.transcription) <> ''
        AND m.transcription LIKE '%Speaker %'
        AND ${miningEligibleSql("COALESCE(m.metadata->>'type', 'nao_classificado')")}
        AND COALESCE((m.metadata->'speaker_sides'->>'v')::int, -1) < $1
      ORDER BY m.meeting_date DESC NULLS LAST
      LIMIT $2`,
    [SPEAKER_SIDES_VERSION, limit]
  );
  return rows.map((r) => r.id);
}

async function load(meetingId: string) {
  const { rows } = await pool.query<{ transcription: string | null; metadata: unknown }>(
    `SELECT transcription, metadata FROM meetings WHERE id = $1`,
    [meetingId]
  );
  return rows[0] ?? null;
}

async function save(meetingId: string, sides: StoredSpeakerSides) {
  // Mescla: metadata carrega type, topics e plaud_file_id, que não podem ser
  // sobrescritos por esta etapa.
  await pool.query(
    `UPDATE meetings
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('speaker_sides', $2::jsonb),
            updated_at = now()
      WHERE id = $1`,
    [meetingId, JSON.stringify(sides)]
  );
}

export async function classifyPendingSpeakerSides(
  limit = MAX_POR_EXECUCAO
): Promise<ClassifySidesSummary> {
  const summary: ClassifySidesSummary = { classified: 0, skipped: 0, failed: 0, unusable: 0 };

  // Sem chave, a etapa inteira é no-op silenciosa: a ingestão funcionava sem
  // ela antes e precisa continuar funcionando.
  if (!isTypeSafeConfigured()) return summary;

  const ids = await pendingMeetingIds(limit);
  if (!ids.length) return summary;

  console.log(`[Sides] Classificando falantes de ${ids.length} conversa(s)...`);

  for (const id of ids) {
    const r = await classifyConversationSides(id, { load, save });
    if (r.status === 'classified') {
      summary.classified += 1;
      if (r.indeterminateShare > 0.3) summary.unusable += 1;
    } else if (r.status === 'skipped') {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
      console.warn(`[Sides] Falha em ${id}: ${r.reason}`);
    }
  }

  console.log(
    `[Sides] ${summary.classified} classificada(s), ${summary.skipped} pulada(s), ` +
      `${summary.failed} falha(s), ${summary.unusable} sem lado definido o bastante.`
  );
  return summary;
}
