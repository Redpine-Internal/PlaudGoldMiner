import { z } from 'zod';
import { pool } from '@/lib/db';
import type { TranscriptionResult } from '@/lib/ai/prompts/process-transcription';

const problemSchema = z.object({
  description: z.string(),
  mentions: z.number(),
  severity: z.enum(['baixa', 'media', 'alta']),
});

export const conversationAiAnalysisSchema = z.object({
  version: z.literal(1),
  summary: z.string(),
  topics: z.array(z.string()),
  participants: z.array(z.string()),
  problems: z.array(problemSchema),
  analyzedAt: z.string(),
});

export type ConversationAiAnalysis = z.infer<typeof conversationAiAnalysisSchema>;

export interface ConversationAiAnalysisLookup {
  localConversationId: string;
  analysis: ConversationAiAnalysis | null;
}

interface AnalysisRow {
  id: string;
  status: string;
  updated_at: Date | string;
  ai_analysis: unknown;
  topics: unknown;
  participants: unknown;
  legacy_summary: string | null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function createConversationAiAnalysis(
  result: TranscriptionResult,
  analyzedAt = new Date()
): ConversationAiAnalysis {
  return {
    version: 1,
    summary: result.summary,
    topics: result.topics,
    participants: result.participants,
    problems: result.problems,
    analyzedAt: analyzedAt.toISOString(),
  };
}

/**
 * Persiste a análise produzida pela nossa IA separadamente do resumo do Plaud.
 * O JSON vive em meetings.metadata, portanto não exige alterar a view legada
 * `conversations` nem criar uma migration para um único campo de aplicação.
 */
export async function saveConversationAiAnalysis(
  conversationId: string,
  analysis: ConversationAiAnalysis
): Promise<void> {
  const result = await pool.query(
    `UPDATE meetings
        SET metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object('ai_analysis', $2::jsonb),
            updated_at = now()
      WHERE id = $1`,
    [conversationId, JSON.stringify(analysis)]
  );

  if (result.rowCount === 0) {
    throw new Error(`Conversation not found while saving AI analysis: ${conversationId}`);
  }
}

function analysisFromRow(row: AnalysisRow): ConversationAiAnalysis | null {
  const stored = conversationAiAnalysisSchema.safeParse(row.ai_analysis);
  if (stored.success) return stored.data;

  // Compatibilidade com análises geradas antes da separação: naquele fluxo a
  // nossa IA gravava o resultado em summaries e marcava meetings como
  // summarized. Assim a análise que o usuário já pagou para gerar reaparece,
  // sem exigir que ela seja processada novamente.
  if (row.status !== 'summarized' || !row.legacy_summary?.trim()) return null;

  const updatedAt = new Date(row.updated_at);
  return {
    version: 1,
    summary: row.legacy_summary,
    topics: stringArray(row.topics),
    participants: stringArray(row.participants),
    problems: [],
    analyzedAt: Number.isNaN(updatedAt.getTime()) ? new Date(0).toISOString() : updatedAt.toISOString(),
  };
}

async function findAnalysis(whereSql: string, value: string): Promise<ConversationAiAnalysisLookup | null> {
  const result = await pool.query<AnalysisRow>(
    `SELECT m.id,
            m.status,
            m.updated_at,
            m.metadata->'ai_analysis' AS ai_analysis,
            m.metadata->'topics' AS topics,
            COALESCE(m.metadata->'participants', m.participants) AS participants,
            s.summary_text AS legacy_summary
       FROM meetings m
       LEFT JOIN LATERAL (
         SELECT s2.summary_text
           FROM summaries s2
          WHERE s2.meeting_id = m.id
          ORDER BY s2.created_at DESC
          LIMIT 1
       ) s ON true
      WHERE ${whereSql}
      LIMIT 1`,
    [value]
  );

  const row = result.rows[0];
  if (!row) return null;

  const stored = conversationAiAnalysisSchema.safeParse(row.ai_analysis);
  const analysis = stored.success ? stored.data : analysisFromRow(row);

  // Migração preguiçosa e não destrutiva das análises antigas. Depois deste
  // primeiro acesso, uma sincronização futura do resumo do Plaud não consegue
  // mais substituir a única cópia que restava da análise da aplicação.
  if (!stored.success && analysis) {
    await saveConversationAiAnalysis(row.id, analysis);
  }

  return { localConversationId: row.id, analysis };
}

export function getConversationAiAnalysisById(
  conversationId: string
): Promise<ConversationAiAnalysisLookup | null> {
  return findAnalysis('m.id = $1::uuid', conversationId);
}

export function getConversationAiAnalysisByPlaudFileId(
  fileId: string
): Promise<ConversationAiAnalysisLookup | null> {
  return findAnalysis("m.metadata->>'plaud_file_id' = $1", fileId);
}
