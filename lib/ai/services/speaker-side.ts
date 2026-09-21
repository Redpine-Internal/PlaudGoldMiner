import { ask, isTypeSafeConfigured, type AnyQuestion, type ScoreAnswer } from '../typesafe-client';

/**
 * Decide de que lado está cada falante da conversa: cliente ou consultoria.
 *
 * Saber QUEM falou não basta — "Speaker 2" não diz nada por si. O que a
 * qualificação precisa é o lado: "a gente tem dificuldade com terceiros" é dor
 * do cliente quando vem do comprador, e é pitch quando vem de quem vende. Os
 * dois têm as mesmas palavras e significados opostos.
 *
 * Classifica pelo CONJUNTO das falas de cada um, não trecho a trecho: o papel
 * de alguém na conversa se revela ao longo dela, e decidir por trecho produz
 * um falante que muda de lado no meio do diálogo.
 *
 * Não identifica pessoas. "Speaker 2 é a Márcia, gerente de SST" seria outro
 * problema, mais difícil e desnecessário aqui.
 */

export type Side = 'cliente' | 'consultoria' | 'indeterminado';

export interface SpeakerTurns {
  /** Rótulo como aparece na transcrição: "Speaker 1". */
  label: string;
  /** As falas desse falante, na ordem. */
  utterances: string[];
}

export interface SideResult {
  label: string;
  side: Side;
  /** Posição na régua; usada para auditar decisões perto da fronteira. */
  score: number;
  confidence: number;
}

export type SideResponse =
  | { success: true; sides: SideResult[] }
  | { success: false; error: { code: string; message: string } };

/**
 * A régua descreve o QUE A PESSOA FAZ na conversa — observável em qualquer
 * trecho — e não quem ela é, que exigiria saber de fora.
 *
 * O nível do meio enumera os casos reais em que a fala não denuncia o lado, em
 * vez de dizer "não sei": participante silencioso, quem só confirma, e o
 * terceiro que não é nem comprador nem vendedor.
 */
const SIDE_LEVELS = [
  'Faz o papel de quem CONTRATA: descreve a operação da própria empresa, relata problemas que vive, responde perguntas sobre como as coisas funcionam ali.',
  'Não dá para dizer: fala pouco, só confirma ou concorda, trata de assunto administrativo (agenda, convite, áudio), ou é um terceiro que não compra nem vende.',
  'Faz o papel de quem PRESTA O SERVIÇO: conduz a conversa, faz perguntas de diagnóstico, apresenta método, explica conceito, propõe solução.',
];

const CLIENTE = 0;
const INDETERMINADO = 1;
const CONSULTORIA = 2;

/** Quanto de fala de um falante vai ao modelo. O papel se revela cedo. */
const MAX_CHARS_POR_FALANTE = 1800;
/** Abaixo disto, o falante não tem fala suficiente para julgar. */
const MIN_CHARS_UTEIS = 120;

/**
 * Confiança mínima para aceitar a classificação.
 *
 * Abaixo disso a distribuição está espalhada — nenhum nível se destaca — e
 * atribuir um lado seria chute com tipo. Vira `indeterminado`, e as perguntas
 * que dependem de lado respondem "não" para esse falante.
 */
const MIN_CONFIDENCE = 0.4;

/** Separa a transcrição em falantes e suas falas. */
export function parseSpeakers(transcription: string): SpeakerTurns[] {
  const porFalante = new Map<string, string[]>();
  for (const linha of transcription.split('\n')) {
    const m = linha.match(/^(Speaker\s+\S+?):\s*(.+)$/);
    if (!m) continue;
    const [, label, texto] = m;
    const lista = porFalante.get(label) ?? [];
    lista.push(texto.trim());
    porFalante.set(label, lista);
  }
  return [...porFalante.entries()].map(([label, utterances]) => ({ label, utterances }));
}

/** Amostra as falas de um falante: começo e meio, onde o papel aparece. */
function amostrar(utterances: string[]): string {
  const inteiro = utterances.join(' ');
  if (inteiro.length <= MAX_CHARS_POR_FALANTE) return inteiro;
  // Metade do início (abertura denuncia quem conduz) e metade do meio.
  const metade = Math.floor(MAX_CHARS_POR_FALANTE / 2);
  const meio = Math.floor(inteiro.length / 2);
  return `${inteiro.slice(0, metade)} […] ${inteiro.slice(meio, meio + metade)}`;
}

export async function classifySpeakerSides(
  speakers: SpeakerTurns[],
  opts: { signal?: AbortSignal } = {}
): Promise<SideResponse> {
  if (!isTypeSafeConfigured()) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'TYPESAFE_API_KEY não definida.' } };
  }
  if (!speakers.length) return { success: true, sides: [] };

  // Falante sem fala suficiente não vai ao modelo: julgar "tá" e "uhum" produz
  // ruído com aparência de resposta.
  const curtos = speakers.filter((s) => s.utterances.join(' ').length < MIN_CHARS_UTEIS);
  const julgaveis = speakers.filter((s) => s.utterances.join(' ').length >= MIN_CHARS_UTEIS);

  const sides: SideResult[] = curtos.map((s) => ({
    label: s.label,
    side: 'indeterminado' as const,
    score: INDETERMINADO,
    confidence: 0,
  }));

  if (!julgaveis.length) return { success: true, sides };

  // Um estado com todas as falas, uma pergunta por falante: o modelo compara
  // os papéis entre si, que é como o papel de cada um fica evidente.
  const state: Record<string, unknown> = {};
  const questions: Record<string, AnyQuestion> = {};
  julgaveis.forEach((s, i) => {
    const ref = `falante_${i}`;
    state[ref] = amostrar(s.utterances);
    questions[ref] = {
      kind: 'score',
      instructions: `Na conversa, qual papel a pessoa em \`${ref}\` desempenha?`,
      criteria: SIDE_LEVELS,
    };
  });

  const res = await ask(state, questions, { signal: opts.signal });
  if (!res.success) return { success: false, error: res.error };

  julgaveis.forEach((s, i) => {
    const a = res.answers[`falante_${i}`] as ScoreAnswer | undefined;
    const score = a?.score ?? INDETERMINADO;
    const confidence = a?.confidence ?? 0;
    const nivel = Math.round(score);

    // Confiança baixa vira indeterminado: a decisão é do instrumento, não do
    // modelo, e atribuir lado sem base inverte o sinal das perguntas seguintes.
    const side: Side =
      confidence < MIN_CONFIDENCE
        ? 'indeterminado'
        : nivel === CLIENTE
          ? 'cliente'
          : nivel === CONSULTORIA
            ? 'consultoria'
            : 'indeterminado';

    sides.push({ label: s.label, side, score, confidence });
  });

  return { success: true, sides };
}

/**
 * Proporção da fala que ficou sem lado definido.
 *
 * É o número que decide se a qualificação é aplicável: acima de ~30% o eixo de
 * intenção não é utilizável, e o que se tem é um classificador de gatilho, não
 * de dor. Pesa por volume de fala, não por número de falantes — um participante
 * mudo indeterminado não compromete nada.
 */
export function indeterminateShare(speakers: SpeakerTurns[], sides: SideResult[]): number {
  const porLabel = new Map(sides.map((s) => [s.label, s.side]));
  let total = 0;
  let indef = 0;
  for (const s of speakers) {
    const chars = s.utterances.join(' ').length;
    total += chars;
    if ((porLabel.get(s.label) ?? 'indeterminado') === 'indeterminado') indef += chars;
  }
  return total ? indef / total : 1;
}
