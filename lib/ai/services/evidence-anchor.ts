import { selectEvidence, candidateId, type EvidenceCandidate } from './evidence-selector';
import { isTypeSafeConfigured } from '../typesafe-client';

/**
 * Ancora a dor numa passagem literal da transcrição.
 *
 * Quando a análise roda sobre extratos, o trecho que a IA devolve é paráfrase
 * dela mesma. O usuário leva esse texto para uma reunião comercial, então a
 * origem precisa ser verdadeira: ou é fala de alguém, ou não é apresentada como
 * tal.
 *
 * A heurística léxica (`findInTranscription`) erra de dois jeitos conhecidos: a
 * paráfrase troca as palavras que ela procura, e a pergunta do consultor sobre
 * o tema contém as mesmas palavras-chave da dor — por construção, já que ele
 * está perguntando sobre ela. Nos dois casos ela devolve algo com cara de
 * acerto.
 *
 * Aqui a heurística vira PRÉ-FILTRO, não decisor: ela propõe as passagens
 * plausíveis e o julgamento diz qual sustenta a dor, ou que nenhuma sustenta.
 * Sem TypeSafe configurado, o comportamento é exatamente o de antes.
 */

export interface AnchorResult {
  /** Passagem a exibir; `null` quando não há nada melhor que o texto original. */
  excerpt: string | null;
  /** `true` só quando se sabe que é fala literal de alguém na reunião. */
  fromTranscription: boolean;
  /** Por que não confirmou — para log e medição, não para a tela. */
  reason?: 'nao-existe' | 'e-pergunta' | 'baixa-confianca' | 'indisponivel' | 'sem-candidatos';
}

/**
 * Quantas passagens vão ao julgamento.
 *
 * O Choice aceita bem mais, mas cada opção é contexto e a chance de a certa
 * estar fora das 12 melhores é pequena — enquanto o custo de mandar 100 é
 * certo.
 */
export const MAX_CANDIDATES = 12;

/** Passagem curta demais não sustenta citação; longa demais não cabe no card. */
const MIN_CHARS = 40;
const MAX_CHARS = 600;

/**
 * Junta as frases da transcrição em janelas sobrepostas.
 *
 * A sobreposição existe porque a fala que sustenta a dor pode estar na fronteira
 * entre duas janelas; sem ela, a passagem certa chega ao julgamento partida ao
 * meio.
 */
export function buildCandidates(
  transcription: string,
  rank: (text: string) => number,
  limit = MAX_CANDIDATES
): EvidenceCandidate[] {
  const sentences = transcription
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  if (!sentences.length) return [];

  const WINDOW = 3;
  const STEP = 2;
  const janelas: { text: string; score: number }[] = [];
  for (let i = 0; i < sentences.length; i += STEP) {
    const text = sentences.slice(i, i + WINDOW).join(' ');
    if (text.length < MIN_CHARS) continue;
    janelas.push({ text: text.slice(0, MAX_CHARS), score: rank(text) });
  }

  return janelas
    .filter((j) => j.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((j, i) => ({ id: candidateId(i), text: j.text }));
}

export interface AnchorDeps {
  /** Heurística léxica existente; decide sozinha quando não há julgamento. */
  fallback: (transcription: string, phrase: string) => string | null;
  /** Pontua uma janela para o pré-filtro. */
  rank: (transcription: string, phrase: string, window: string) => number;
}

/**
 * Tenta ancorar; devolve sempre algo exibível.
 *
 * Nunca lança: uma falha de rede no julgamento não pode custar a oportunidade
 * inteira, que já foi detectada e é válida. O pior caso é o comportamento
 * anterior — texto do resumo, marcado como não confirmado.
 */
export async function anchorEvidence(
  pain: string,
  phrase: string,
  transcription: string,
  deps: AnchorDeps,
  opts: { signal?: AbortSignal } = {}
): Promise<AnchorResult> {
  const heuristico = deps.fallback(transcription, phrase);

  if (!isTypeSafeConfigured()) {
    return { excerpt: heuristico ?? phrase, fromTranscription: !!heuristico, reason: 'indisponivel' };
  }

  const candidates = buildCandidates(transcription, (w) => deps.rank(transcription, phrase, w));
  if (!candidates.length) {
    return { excerpt: phrase, fromTranscription: false, reason: 'sem-candidatos' };
  }

  let selection;
  try {
    selection = await selectEvidence(pain, candidates, { signal: opts.signal });
  } catch {
    return { excerpt: heuristico ?? phrase, fromTranscription: !!heuristico, reason: 'indisponivel' };
  }

  if (selection.kind === 'found') {
    return { excerpt: selection.text, fromTranscription: true };
  }

  if (selection.kind === 'unavailable') {
    // Julgamento fora do ar: mantém o comportamento anterior, inclusive o
    // acerto da heurística quando ela acerta.
    return { excerpt: heuristico ?? phrase, fromTranscription: !!heuristico, reason: 'indisponivel' };
  }

  // Julgou e recusou. A heurística pode ter devolvido algo — e é justamente
  // esse "algo" que o julgamento acabou de rejeitar. Exibir o texto original,
  // marcado como não confirmado, é o único caminho honesto.
  return { excerpt: phrase, fromTranscription: false, reason: selection.reason };
}
