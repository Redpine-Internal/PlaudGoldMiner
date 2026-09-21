import { classifySpeakerSides, parseSpeakers, indeterminateShare } from '@/lib/ai/services/speaker-side';
import {
  needsClassification,
  SPEAKER_SIDES_VERSION,
  type StoredSpeakerSides,
} from './speaker-sides-store';

/**
 * Classifica o lado dos falantes de uma conversa e grava no metadata.
 *
 * Roda DEPOIS do commit da ingestão, nunca dentro dele. Uma chamada de rede
 * segurando transação aberta transforma lentidão do TypeSafe em lock no banco,
 * e uma indisponibilidade dele passaria a derrubar a ingestão — que hoje
 * funciona sem ele e deve continuar funcionando.
 *
 * Por isso toda falha aqui é silenciosa no fluxo: devolve o motivo, não lança.
 * A conversa fica sem classificação e a próxima execução tenta de novo, porque
 * `needsClassification` continua verdadeiro.
 */

export type ClassifyOutcome =
  | { status: 'classified'; sides: number; indeterminateShare: number }
  | { status: 'skipped'; reason: 'ja-classificada' | 'sem-falantes' | 'sem-transcricao' }
  | { status: 'failed'; reason: string };

export interface ClassifyDeps {
  /** Lê transcrição e metadata da conversa. */
  load: (meetingId: string) => Promise<{ transcription: string | null; metadata: unknown } | null>;
  /** Mescla o bloco em `meetings.metadata`. */
  save: (meetingId: string, sides: StoredSpeakerSides) => Promise<void>;
  now?: () => Date;
}

export async function classifyConversationSides(
  meetingId: string,
  deps: ClassifyDeps,
  opts: { force?: boolean; signal?: AbortSignal } = {}
): Promise<ClassifyOutcome> {
  const row = await deps.load(meetingId);
  if (!row) return { status: 'failed', reason: 'conversa não encontrada' };

  if (!opts.force && !needsClassification(row.metadata)) {
    return { status: 'skipped', reason: 'ja-classificada' };
  }
  if (!row.transcription?.trim()) {
    return { status: 'skipped', reason: 'sem-transcricao' };
  }

  // Sem marcação "Speaker N:" não há o que separar. Transcrição antiga, não
  // recuperada da API do Plaud, cai aqui — e deve mesmo ficar sem lado, em vez
  // de receber um palpite sobre um único bloco de texto.
  const speakers = parseSpeakers(row.transcription);
  if (speakers.length < 2) {
    return { status: 'skipped', reason: 'sem-falantes' };
  }

  const res = await classifySpeakerSides(speakers, { signal: opts.signal });
  if (!res.success) return { status: 'failed', reason: res.error.message };

  const share = indeterminateShare(speakers, res.sides);
  const stored: StoredSpeakerSides = {
    v: SPEAKER_SIDES_VERSION,
    sides: res.sides.map((s) => ({ label: s.label, side: s.side, confidence: s.confidence })),
    indeterminateShare: share,
    classifiedAt: (deps.now?.() ?? new Date()).toISOString(),
  };

  await deps.save(meetingId, stored);
  return { status: 'classified', sides: stored.sides.length, indeterminateShare: share };
}
