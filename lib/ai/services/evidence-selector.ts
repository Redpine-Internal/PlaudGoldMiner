import {
  ask,
  isTypeSafeConfigured,
  MAX_CHOICE_OPTIONS,
  type AnyQuestion,
  type ChoiceAnswer,
} from '../typesafe-client';

/**
 * Escolhe, na transcrição, a passagem que sustenta uma dor — ou diz que não há.
 *
 * O trecho que aparece no card é o que o operador leva para uma reunião
 * comercial. Citar o que ninguém disse queima a credibilidade do negócio, então
 * errar para "não confirmado" é muito mais barato que errar para a passagem
 * errada.
 *
 * `findInTranscription` (a heurística que isto complementa) acerta a passagem
 * por sobreposição de palavras. Ela falha de dois jeitos:
 *
 *   1. No modo resumo, o trecho que a IA cita é paráfrase dela mesma, e a
 *      paráfrase troca justamente as palavras que a heurística procura.
 *   2. Uma pergunta do consultor sobre o tema contém as mesmas palavras-chave
 *      da dor — por construção, já que ele está perguntando sobre ela. A
 *      heurística pontua alto e devolve a pergunta em vez do relato.
 *
 * O desenho vem do `semantic_find`: o Choice escolhe entre linhas identificadas,
 * e um Noul separado diz se existe resposta. As probabilidades do Choice somam
 * 1, então alguma linha sempre vence — sem o Noul, "nenhuma serve" é
 * inexprimível. Um segundo Noul separa relato de pergunta, que é o erro
 * específico observado no acervo.
 */

export interface EvidenceCandidate {
  /** Id curto e estável, usado como opção do Choice (L001, L002…). */
  id: string;
  /** A passagem literal da transcrição. */
  text: string;
}

export type EvidenceSelection =
  /** Passagem encontrada e confirmada como relato do cliente. */
  | { kind: 'found'; candidateId: string; text: string; confidence: number }
  /** Nenhuma passagem sustenta a dor, ou a melhor é pergunta do consultor. */
  | { kind: 'none'; reason: 'nao-existe' | 'e-pergunta' | 'baixa-confianca' }
  /** TypeSafe indisponível — quem chama mantém a heurística. */
  | { kind: 'unavailable'; reason: string };

/**
 * Limiares da política. Ficam aqui, em código, e não na cabeça do modelo.
 *
 * Os valores seguem os do `semantic_find` (0,7 encontrado / 0,35 ausente), com
 * um terceiro para a pergunta do consultor. Merecem revisão sobre dados reais
 * antes de virar automação sem supervisão.
 */
export const EXISTS_THRESHOLD = 0.7;
export const CONSULTANT_QUESTION_THRESHOLD = 0.5;
export const MIN_CHOICE_CONFIDENCE = 0.3;

/** Id de candidato no formato que o modelo lê no estado. */
export const candidateId = (i: number) => `L${String(i + 1).padStart(3, '0')}`;

export async function selectEvidence(
  pain: string,
  candidates: EvidenceCandidate[],
  opts: { signal?: AbortSignal } = {}
): Promise<EvidenceSelection> {
  if (!isTypeSafeConfigured()) {
    return { kind: 'unavailable', reason: 'TYPESAFE_API_KEY não configurada.' };
  }
  if (!candidates.length) return { kind: 'none', reason: 'nao-existe' };
  if (candidates.length > MAX_CHOICE_OPTIONS) {
    return {
      kind: 'unavailable',
      reason: `${candidates.length} candidatos excedem o teto de ${MAX_CHOICE_OPTIONS} opções por pergunta.`,
    };
  }

  // O estado traz cada passagem prefixada pelo seu id: o modelo aponta para o
  // texto sem precisar gerá-lo, e o que volta é sempre uma das passagens.
  const state = candidates.map((c) => `${c.id}| ${c.text}`).join('\n');

  const questions: Record<string, AnyQuestion> = {
    // As descrições das opções são null porque o estado já traz o texto de cada id.
    onde: {
      kind: 'choice',
      instructions: `Qual passagem do documento é o CLIENTE relatando esta dor: "${pain}"?`,
      criteria: Object.fromEntries(candidates.map((c) => [c.id, null])),
    },
    // Sem isto, "nenhuma serve" é inexprimível: a distribuição do Choice soma 1.
    existe: {
      kind: 'noul',
      instructions: `Alguma passagem do documento relata esta dor: "${pain}"?`,
      criteria: {
        true: 'Ao menos uma passagem descreve esse problema como algo que a operação vive.',
        false: 'Nenhuma passagem descreve esse problema; no máximo tocam no assunto de passagem.',
      },
    },
    // O erro específico do acervo: a pergunta do consultor contém as mesmas
    // palavras-chave da dor e a heurística léxica a escolhe no lugar do relato.
    e_pergunta: {
      kind: 'noul',
      instructions:
        'A passagem mais relevante para essa dor é o CONSULTOR perguntando ou introduzindo o assunto, em vez de alguém da operação relatando o problema?',
      criteria: {
        true: 'É pergunta, convite a falar, ou fala de quem conduz a conversa.',
        false: 'É alguém da operação descrevendo o que acontece no dia a dia.',
      },
    },
  };

  const res = await ask(state, questions, { signal: opts.signal });
  if (!res.success) return { kind: 'unavailable', reason: res.error.message };

  const existe = res.answers.existe as number;
  const ePergunta = res.answers.e_pergunta as number;
  const onde = res.answers.onde as ChoiceAnswer;

  // A ordem importa: sem relato nenhum, não faz sentido perguntar se o que
  // ganhou é pergunta do consultor.
  if (existe < EXISTS_THRESHOLD) return { kind: 'none', reason: 'nao-existe' };
  if (ePergunta > CONSULTANT_QUESTION_THRESHOLD) return { kind: 'none', reason: 'e-pergunta' };
  if (onde.confidence < MIN_CHOICE_CONFIDENCE) {
    // Distribuição espalhada: nenhuma passagem se destaca. Uma escolha assim é
    // chute com tipo, e vira citação falsa na tela.
    return { kind: 'none', reason: 'baixa-confianca' };
  }

  const picked = candidates.find((c) => c.id === onde.choice);
  if (!picked) return { kind: 'none', reason: 'nao-existe' };

  return {
    kind: 'found',
    candidateId: picked.id,
    text: picked.text,
    confidence: onde.confidence,
  };
}
