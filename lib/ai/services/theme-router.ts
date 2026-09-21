import { ask, isTypeSafeConfigured, type AnyQuestion, type ScoreAnswer } from '../typesafe-client';

/**
 * Roteia um negócio novo para um tema existente — ou diz que é assunto novo.
 *
 * O agrupamento em lote relê TODOS os negócios a cada rodada e é caro. Mas o
 * caso comum é outro: uma reunião nova tocando num assunto que já está na tela.
 * Aqui a pergunta é menor — "este negócio é o mesmo assunto que X?" — uma por
 * tema, todas num request, avaliadas em paralelo e em isolamento.
 *
 * A régua é um Score de três níveis, e os níveis SÃO as três ações possíveis:
 * descartar, perguntar ao operador, acumular. Não há constante de threshold
 * para calibrar — o que decide é a redação dos níveis, escrita antes de ver
 * qualquer dado. O nível do meio não diz "talvez": enumera os casos que
 * pertencem a ele.
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
  /** O negócio é do tema: entra e fortalece a recorrência. */
  | { kind: 'accumulate'; themeId: string; themeName: string; score: number; confidence: number }
  /** Nenhum tema é o mesmo assunto. */
  | { kind: 'new-theme'; bestScore: number }
  /** Parecido sem ser o mesmo, ou dois temas empatados: decide o operador. */
  | {
      kind: 'ask-operator';
      candidates: Array<{ themeId: string; themeName: string; score: number }>;
    }
  /** TypeSafe indisponível — quem chama cai no agrupamento em lote. */
  | { kind: 'unavailable'; reason: string };

/**
 * Os três níveis são as três saídas. Escrever a régua substitui calibrar
 * limiares: o nível 1 enumera os casos que vão ao operador em vez de dizer
 * "talvez", que é o que torna a fronteira decidível sem dados.
 */
const SAME_THEME_LEVELS = [
  'Tratam de assuntos comerciais diferentes. Compartilhar vocabulário de segurança do trabalho não basta para ser o mesmo tema.',
  'Tratam de assuntos vizinhos que podem ou não ser o mesmo tema: um é caso particular do outro, um é a causa e o outro a consequência, ou o mesmo problema visto de áreas diferentes da operação.',
  'São o mesmo assunto comercial, escrito com outras palavras — o cliente compraria as duas coisas na mesma conversa.',
];

/**
 * A posição é arredondada ao nível mais próximo, e o nível é a ação: 0 abre
 * tema novo, 1 (o do meio, "assunto vizinho") vai ao operador, 2 acumula.
 */
const DISCARD = 0;
const SAME = 2;

/** Dois temas neste raio um do outro estão empatados; o operador desempata. */
const TIE_MARGIN = 0.25;

const questionId = (i: number) => `t${i}`;

/** Monta a pergunta de um tema. Compartilhada entre a rota simples e o lote. */
function themeQuestion(theme: ThemeCandidate, negocioRef: string): AnyQuestion {
  return {
    kind: 'score',
    instructions: JSON.stringify({
      tema: { nome: theme.name, descricao: theme.rationale ?? '' },
      pergunta: `O negócio em \`${negocioRef}\` e o \`tema\` são o mesmo assunto comercial? Considere o assunto de fundo, não o formato da oferta: um treinamento e uma consultoria sobre a mesma dor são o mesmo tema.`,
    }),
    criteria: SAME_THEME_LEVELS,
  };
}

/** Converte a régua na decisão. A política vive aqui, em código auditável. */
function decide(
  scored: Array<{ themeId: string; themeName: string; score: number; confidence: number }>
): RouteDecision {
  const best = scored[0];
  const runnerUp = scored[1];
  const nivel = Math.round(best.score);

  // Empate entre dois temas igualmente bons: escolher por uma fração seria
  // arbitrário, e o erro ficaria invisível na tela.
  if (
    nivel === SAME &&
    runnerUp &&
    Math.round(runnerUp.score) === SAME &&
    best.score - runnerUp.score < TIE_MARGIN
  ) {
    return { kind: 'ask-operator', candidates: [best, runnerUp] };
  }

  if (nivel === SAME) {
    return {
      kind: 'accumulate',
      themeId: best.themeId,
      themeName: best.themeName,
      score: best.score,
      confidence: best.confidence,
    };
  }
  if (nivel === DISCARD) return { kind: 'new-theme', bestScore: best.score };
  // Nível OPERATOR — assunto vizinho, que a régua descreve mas não resolve.
  return { kind: 'ask-operator', candidates: scored.slice(0, 3) };
}

export async function routeToTheme(
  opportunity: OpportunityToRoute,
  themes: ThemeCandidate[],
  opts: { signal?: AbortSignal } = {}
): Promise<RouteDecision> {
  if (!isTypeSafeConfigured()) {
    return { kind: 'unavailable', reason: 'TYPESAFE_API_KEY não configurada.' };
  }
  // Sem tema nenhum não há o que rotear — o primeiro negócio sempre abre tema.
  if (!themes.length) return { kind: 'new-theme', bestScore: 0 };

  const state = {
    negocio: {
      titulo: opportunity.title,
      dor: opportunity.pain,
      contexto: opportunity.context,
    },
  };

  const questions: Record<string, AnyQuestion> = {};
  themes.forEach((theme, i) => {
    questions[questionId(i)] = themeQuestion(theme, 'negocio');
  });

  const res = await ask(state, questions, { signal: opts.signal });
  if (!res.success) return { kind: 'unavailable', reason: res.error.message };

  const scored = themes
    .map((theme, i) => {
      const a = res.answers[questionId(i)] as ScoreAnswer | undefined;
      return {
        themeId: theme.id,
        themeName: theme.name,
        score: a?.score ?? 0,
        confidence: a?.confidence ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  return decide(scored);
}

/**
 * Roteia VÁRIOS negócios contra os mesmos temas, numa requisição só.
 *
 * O estado é quase todo o custo e as perguntas são avaliadas em paralelo, então
 * N negócios × M temas numa requisição sai muito mais barato que N requisições
 * — e as respostas não mudam, porque nenhuma pergunta vê as outras.
 *
 * O limite prático é o produto N × M de perguntas por requisição; quem chama
 * fatia os negócios em blocos.
 */
export async function routeManyToThemes(
  opportunities: Array<OpportunityToRoute & { id: string }>,
  themes: ThemeCandidate[],
  opts: { signal?: AbortSignal } = {}
): Promise<Map<string, RouteDecision>> {
  const out = new Map<string, RouteDecision>();
  if (!isTypeSafeConfigured()) {
    for (const o of opportunities) {
      out.set(o.id, { kind: 'unavailable', reason: 'TYPESAFE_API_KEY não configurada.' });
    }
    return out;
  }
  if (!opportunities.length) return out;
  if (!themes.length) {
    for (const o of opportunities) out.set(o.id, { kind: 'new-theme', bestScore: 0 });
    return out;
  }

  // Cada negócio é um campo do estado; cada pergunta aponta para o seu com uma
  // referência nomeada, que é como a API liga pergunta e parte do estado.
  const state: Record<string, unknown> = {};
  const questions: Record<string, AnyQuestion> = {};
  opportunities.forEach((o, oi) => {
    const ref = `negocio_${oi}`;
    state[ref] = { titulo: o.title, dor: o.pain, contexto: o.context };
    themes.forEach((theme, ti) => {
      questions[`o${oi}_${questionId(ti)}`] = themeQuestion(theme, ref);
    });
  });

  const res = await ask(state, questions, { signal: opts.signal });
  if (!res.success) {
    for (const o of opportunities) {
      out.set(o.id, { kind: 'unavailable', reason: res.error.message });
    }
    return out;
  }

  opportunities.forEach((o, oi) => {
    const scored = themes
      .map((theme, ti) => {
        const a = res.answers[`o${oi}_${questionId(ti)}`] as ScoreAnswer | undefined;
        return {
          themeId: theme.id,
          themeName: theme.name,
          score: a?.score ?? 0,
          confidence: a?.confidence ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score);
    out.set(o.id, decide(scored));
  });

  return out;
}
