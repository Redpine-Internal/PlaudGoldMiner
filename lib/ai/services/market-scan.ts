import { searchWeb, isExaConfigured } from '@/lib/research/exa-client';
import { ask, isTypeSafeConfigured, type AnyQuestion, type ScoreAnswer } from '../typesafe-client';

/**
 * Descobre se o mercado brasileiro já atende um tema — e quem o atende.
 *
 * A recorrência diz que o assunto aparece nas conversas. Não diz se vale
 * perseguir: um tema muito citado cujo mercado já tem as grandes consultorias
 * é uma disputa cara; um tema menos citado sem ninguém especializado é espaço
 * aberto. Sem essa leitura, a lista ordena por demanda e ignora a concorrência.
 *
 * Duas etapas, cada uma no que sabe fazer:
 *   1. Exa busca páginas reais e datadas. Nenhum modelo sabe quem vende o quê
 *      hoje — perguntar isso a um LLM devolve palpite com cara de pesquisa.
 *   2. Jev julga o que foi encontrado, com uma régua cujos níveis descrevem o
 *      que se observa nos resultados, não o que se supõe do mercado.
 */

export interface MarketScanInput {
  /** Nome do tema, como aparece na tela. */
  name: string;
  /** O que une os negócios do tema — afina a busca. */
  rationale: string | null;
}

export interface MarketScan {
  /** 0 a 3: de "ninguém oferece" a "mercado consolidado". */
  saturation: number;
  /** Concentração da distribuição. Baixa = os resultados não deixam claro. */
  confidence: number;
  /** Probabilidade de haver grande consultoria entre os fornecedores. */
  bigPlayers: number;
  /** Probabilidade de os resultados serem conteúdo sobre o tema, não ofertas. */
  contentOnly: boolean;
  /** As páginas que sustentam a leitura — o operador confere na fonte. */
  sources: Array<{ title: string; url: string }>;
  /** Custo em dólares desta varredura, para o operador saber o que gastou. */
  costDollars: number;
}

export type MarketScanResult =
  | { success: true; scan: MarketScan }
  | { success: false; error: { code: string; message: string } };

/**
 * Os níveis descrevem O QUE SE VÊ NOS RESULTADOS, não o tamanho do mercado.
 * "Mercado grande" depende de dados que a busca não traz; "vários fornecedores
 * com página dedicada" é verificável por quem abre os links.
 */
const SATURATION_LEVELS = [
  'Nenhum fornecedor encontrado oferecendo isso. Os resultados falam do problema — normas, artigos, notícias — e não de quem o resolve.',
  'Poucos fornecedores, com oferta genérica ou tangencial: o assunto aparece como item dentro de serviços mais amplos, sem página própria.',
  'Vários fornecedores brasileiros com oferta dedicada e página própria para este serviço.',
  'Mercado consolidado: muitos fornecedores, incluindo grandes consultorias, com oferta madura e padronizada.',
];

/** Acima disto, os resultados são conteúdo sobre o tema, não ofertas comerciais. */
const CONTENT_ONLY_THRESHOLD = 0.5;

/** Monta a consulta de busca a partir do tema. */
export function buildQuery(input: MarketScanInput): string {
  const base = `consultoria e treinamento em ${input.name} para empresas no Brasil`;
  // O rationale traz o vocabulário específico do tema; sem ele a busca fica
  // genérica demais e devolve os mesmos players para temas diferentes.
  return input.rationale ? `${base} — ${input.rationale.slice(0, 160)}` : base;
}

export async function scanMarket(
  input: MarketScanInput,
  opts: { signal?: AbortSignal } = {}
): Promise<MarketScanResult> {
  if (!isExaConfigured()) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'EXA_API_KEY não definida.' } };
  }
  if (!isTypeSafeConfigured()) {
    return {
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'TYPESAFE_API_KEY não definida.' },
    };
  }

  const found = await searchWeb(buildQuery(input), { numResults: 8, signal: opts.signal });
  if (!found.success) return { success: false, error: found.error };
  if (!found.hits.length) {
    return { success: false, error: { code: 'NO_RESULTS', message: 'A busca não devolveu nada.' } };
  }

  // Cada resultado ganha um id: o julgamento fala dos resultados como conjunto,
  // e o operador confere nos links que acompanham a resposta.
  const resultados = found.hits
    .map((h, i) => `F${i + 1}| ${h.title}\n    ${h.text.slice(0, 300)}`)
    .join('\n');

  const questions: Record<string, AnyQuestion> = {
    saturacao: {
      kind: 'score',
      instructions:
        'Quão atendido pelo mercado brasileiro está o tema em `tema`, segundo `resultados_de_busca`?',
      criteria: SATURATION_LEVELS,
    },
    grandes: {
      kind: 'noul',
      instructions:
        'Há grandes consultorias (EY, KPMG, Deloitte, PwC, Accenture) entre os fornecedores encontrados em `resultados_de_busca`?',
      criteria: {
        true: 'Sim, ao menos uma grande consultoria oferece este serviço.',
        false: 'Não; apenas fornecedores pequenos, médios ou especializados.',
      },
    },
    // Sem isto, uma busca que só achou artigos e normas seria lida como
    // "ninguém oferece" — quando na verdade a busca é que não achou ofertas.
    so_conteudo: {
      kind: 'noul',
      instructions:
        'Os resultados em `resultados_de_busca` são majoritariamente conteúdo sobre o assunto (artigos, normas, notícias) em vez de empresas vendendo a solução?',
      criteria: {
        true: 'São majoritariamente conteúdo informativo, não ofertas comerciais.',
        false: 'São páginas de empresas oferecendo o serviço.',
      },
    },
  };

  const judged = await ask(
    { tema: input.name, resultados_de_busca: resultados },
    questions,
    { signal: opts.signal }
  );
  if (!judged.success) return { success: false, error: judged.error };

  const saturacao = judged.answers.saturacao as ScoreAnswer;
  const grandes = judged.answers.grandes as number;
  const soConteudo = judged.answers.so_conteudo as number;

  return {
    success: true,
    scan: {
      saturation: saturacao.score,
      confidence: saturacao.confidence,
      bigPlayers: grandes,
      contentOnly: soConteudo > CONTENT_ONLY_THRESHOLD,
      sources: found.hits.slice(0, 8).map((h) => ({ title: h.title, url: h.url })),
      costDollars: found.costDollars,
    },
  };
}

/**
 * Leitura curta para a tela, combinando saturação com a presença dos grandes.
 *
 * A combinação é o que decide: demanda alta com as grandes na frente é disputa
 * cara; demanda menor sem especialista é espaço aberto. Nenhum dos dois números
 * diz isso sozinho.
 */
export function describeMarket(scan: MarketScan): string {
  if (scan.contentOnly) return 'A busca achou conteúdo sobre o tema, não fornecedores — verificar à mão.';

  const nivel = Math.round(scan.saturation);
  const comGrandes = scan.bigPlayers > 0.5;

  if (nivel === 0) return 'Ninguém encontrado oferecendo isso — oferta a construir.';
  if (nivel === 1) return 'Poucos fornecedores, oferta genérica — espaço para quem se especializar.';
  if (nivel === 2) {
    return comGrandes
      ? 'Mercado formado, já com grandes consultorias.'
      : 'Mercado formado, mas sem as grandes consultorias — espaço para especialista.';
  }
  return comGrandes
    ? 'Mercado consolidado e disputado pelas grandes consultorias.'
    : 'Mercado consolidado entre especialistas.';
}
