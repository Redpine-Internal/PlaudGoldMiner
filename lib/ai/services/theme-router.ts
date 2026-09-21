import { askNouls, isTypeSafeConfigured, type NoulQuestion } from '../typesafe-client';

/**
 * Roteia um negócio novo para um tema existente — ou diz que é assunto novo.
 *
 * O agrupamento em lote (business-theme-grouper) relê TODOS os negócios a cada
 * rodada e é caro. Mas o caso comum não é esse: é uma reunião nova que toca num
 * assunto que já está na tela. Aqui a pergunta é outra, e muito menor — "esta
 * dor é o mesmo assunto que 'Gestão de terceiros'?" — uma por tema existente,
 * todas numa requisição, avaliadas em paralelo.
 *
 * IA propõe, código decide: o modelo devolve uma probabilidade por tema e a
 * regra de corte vive aqui, em código auditável. É o mesmo padrão que o filtro
 * de recorrência já usa em opportunity-batch-analyzer.
 */

export interface ThemeCandidate {
  id: string;
  name: string;
  /** O que une os negócios do tema — dá ao modelo o contexto do grupo. */
  rationale: string | null;
}

export interface OpportunityToRoute {
  title: string;
  pain: string;
  context: string;
}

export type RouteDecision =
  /** Probabilidade alta: entra no tema e fortalece a recorrência. */
  | { kind: 'accumulate'; themeId: string; themeName: string; probability: number }
  /** Nenhum tema chegou perto: assunto novo. */
  | { kind: 'new-theme'; probability: number }
  /** Zona cinzenta, ou dois temas empatados: quem decide é o operador. */
  | { kind: 'ask-operator'; candidates: Array<{ themeId: string; themeName: string; probability: number }> }
  /** TypeSafe indisponível — quem chama cai no agrupamento em lote. */
  | { kind: 'unavailable'; reason: string };

/**
 * Limiares, avaliados sobre dados reais antes de mexer.
 *
 * ACCUMULATE alto de propósito: juntar dores diferentes no mesmo tema é pior
 * que criar um tema a mais. Um tema errado dilui a recorrência que justifica
 * perseguir o assunto — e a recorrência é o produto.
 */
export const ACCUMULATE_THRESHOLD = 0.75;
export const NEW_THEME_THRESHOLD = 0.35;
/** Dois temas dentro desta distância são empate: o operador desempata. */
const TIE_MARGIN = 0.1;

/** Ids de pergunta são internos e não vão ao modelo; `t0`, `t1`… basta. */
const questionId = (i: number) => `t${i}`;

export async function routeToTheme(
  opportunity: OpportunityToRoute,
  themes: ThemeCandidate[],
  opts: { signal?: AbortSignal } = {}
): Promise<RouteDecision> {
  if (!isTypeSafeConfigured()) {
    return { kind: 'unavailable', reason: 'TYPESAFE_API_KEY não configurada.' };
  }
  // Sem tema nenhum não há o que rotear — o primeiro negócio sempre abre tema.
  if (!themes.length) return { kind: 'new-theme', probability: 1 };

  // O estado carrega o negócio; cada pergunta carrega o tema que julga. Assim
  // o modelo compara sempre a mesma dor contra um grupo por vez.
  const state = {
    negocio: {
      titulo: opportunity.title,
      dor: opportunity.pain,
      contexto: opportunity.context,
    },
  };

  const questions: Record<string, NoulQuestion> = {};
  themes.forEach((theme, i) => {
    questions[questionId(i)] = {
      instructions: JSON.stringify({
        tema: { nome: theme.name, descricao: theme.rationale ?? '' },
        pergunta:
          'O negócio em `negocio` pertence ao mesmo tema comercial que `tema`? ' +
          'Considere o assunto de fundo, não o formato da oferta: um treinamento e ' +
          'uma consultoria sobre a mesma dor são o mesmo tema.',
      }),
      criteria: {
        true: 'É a mesma dor de fundo, escrita com outras palavras — o cliente compraria as duas coisas na mesma conversa.',
        false: 'É outro assunto. Compartilhar vocabulário de segurança do trabalho não basta para ser o mesmo tema.',
      },
    };
  });

  const res = await askNouls(state, questions, { signal: opts.signal });
  if (!res.success) return { kind: 'unavailable', reason: res.error.message };

  const scored = themes
    .map((theme, i) => ({
      themeId: theme.id,
      themeName: theme.name,
      probability: res.answers[questionId(i)] ?? 0,
    }))
    .sort((a, b) => b.probability - a.probability);

  const best = scored[0];
  const runnerUp = scored[1];

  // Empate técnico entre dois temas: escolher por 0,01 de diferença seria
  // arbitrário, e o erro fica invisível na tela.
  if (
    best.probability >= ACCUMULATE_THRESHOLD &&
    runnerUp &&
    best.probability - runnerUp.probability < TIE_MARGIN &&
    runnerUp.probability >= ACCUMULATE_THRESHOLD
  ) {
    return { kind: 'ask-operator', candidates: [best, runnerUp] };
  }

  if (best.probability >= ACCUMULATE_THRESHOLD) {
    return {
      kind: 'accumulate',
      themeId: best.themeId,
      themeName: best.themeName,
      probability: best.probability,
    };
  }

  if (best.probability < NEW_THEME_THRESHOLD) {
    return { kind: 'new-theme', probability: best.probability };
  }

  // Zona cinzenta: nem claramente o mesmo assunto, nem claramente outro.
  return { kind: 'ask-operator', candidates: scored.slice(0, 3) };
}
