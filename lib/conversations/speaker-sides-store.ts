/**
 * Guarda o lado de cada falante de uma conversa.
 *
 * Mora em `meetings.metadata`, junto de `type` e `topics`, porque é o mesmo
 * tipo de dado: classificação derivada da conversa, lida por quem for minerar.
 * Uma tabela só para isto custaria migração, join e sincronia sem devolver
 * nada — o acesso é sempre "dada esta conversa, quem é quem".
 *
 * O formato guarda a medida junto da conclusão. `indeterminateShare` é o que
 * decide se a qualificação de intenção é aplicável àquela conversa; sem ele,
 * uma conversa classificada e uma conversa inclassificável ficariam iguais na
 * leitura.
 */

export interface StoredSpeakerSide {
  label: string;
  side: 'cliente' | 'consultoria' | 'indeterminado';
  confidence: number;
}

export interface StoredSpeakerSides {
  /** Versão da régua. Muda quando os níveis mudam, para reclassificar o que é velho. */
  v: number;
  sides: StoredSpeakerSide[];
  /** Fração da fala sem lado definido, 0..1. Acima de ~0,3 a intenção não é utilizável. */
  indeterminateShare: number;
  classifiedAt: string;
}

/** Régua atual. Incrementar ao mexer em SIDE_LEVELS de `speaker-side.ts`. */
export const SPEAKER_SIDES_VERSION = 1;

/**
 * Acima disto a conversa não sustenta julgamento de intenção: não se sabe de
 * quem é a maior parte da fala. O valor vem da metodologia de qualificação.
 */
export const MAX_INDETERMINATE_SHARE = 0.3;

/**
 * Lê o bloco do metadata, aceitando qualquer formato anterior sem quebrar.
 *
 * Metadata é jsonb livre e conversas antigas simplesmente não têm a chave, o
 * que é indistinguível de "ainda não classificada" — e é exatamente o que deve
 * acontecer. Devolver `null` em vez de lançar mantém a leitura utilizável para
 * todo o acervo, classificado ou não.
 */
export function readSpeakerSides(metadata: unknown): StoredSpeakerSides | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).speaker_sides;
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.sides)) return null;

  const sides: StoredSpeakerSide[] = [];
  for (const s of obj.sides) {
    if (!s || typeof s !== 'object') continue;
    const item = s as Record<string, unknown>;
    if (typeof item.label !== 'string') continue;
    const side = item.side;
    if (side !== 'cliente' && side !== 'consultoria' && side !== 'indeterminado') continue;
    sides.push({
      label: item.label,
      side,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
    });
  }
  if (!sides.length) return null;

  return {
    v: typeof obj.v === 'number' ? obj.v : 0,
    sides,
    indeterminateShare:
      typeof obj.indeterminateShare === 'number' ? obj.indeterminateShare : 1,
    classifiedAt: typeof obj.classifiedAt === 'string' ? obj.classifiedAt : '',
  };
}

/**
 * Diz se a conversa precisa ser classificada.
 *
 * Classificada com a régua atual não refaz — a chamada custa e a resposta não
 * mudaria. Régua antiga refaz, porque o significado dos níveis mudou.
 */
export function needsClassification(metadata: unknown): boolean {
  const stored = readSpeakerSides(metadata);
  return !stored || stored.v < SPEAKER_SIDES_VERSION;
}

/** Lado de um falante específico, pelo rótulo que aparece na transcrição. */
export function sideOf(
  stored: StoredSpeakerSides | null,
  label: string
): StoredSpeakerSide['side'] {
  if (!stored) return 'indeterminado';
  return stored.sides.find((s) => s.label === label)?.side ?? 'indeterminado';
}

/**
 * Se dá para julgar intenção nesta conversa.
 *
 * Conversa não classificada responde `false`: ausência de dado não é permissão
 * para supor. A qualificação trata isto como "não sei", não como "não tem".
 */
export function supportsIntentJudgement(stored: StoredSpeakerSides | null): boolean {
  if (!stored) return false;
  return stored.indeterminateShare <= MAX_INDETERMINATE_SHARE;
}
