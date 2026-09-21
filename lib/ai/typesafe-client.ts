/**
 * Cliente do TypeSafe (System One / Jev).
 *
 * Diferente do Azure, que gera texto: aqui se faz uma PERGUNTA TIPADA sobre um
 * estado e recebe uma probabilidade calibrada. Nada de prosa para parsear.
 *
 * Por que um segundo fornecedor: o roteamento de tema é um julgamento atômico
 * ("esta dor é o mesmo assunto que X?") repetido uma vez por tema. Fazer isso
 * no Azure custaria cota da mesma janela de 10k tokens/min que a mineração já
 * disputa, e devolveria um "sim/não" sem dizer o quanto o modelo está seguro.
 * A probabilidade é o que permite o limiar de três vias: acumula / cria novo /
 * pergunta ao operador.
 *
 * Contrato: POST https://api.typesafe.ai/v1/systemone
 *   { state, model, questions: { <id>: { type: 'noul', instructions, criteria } } }
 *   → { answers: { <id>: { type: 'noul', noul: 0.93 } }, usage: {...} }
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = 'jev-latest';

/** ~100ms é o normal; acima disso algo está errado e é melhor cair no fallback. */
const TIMEOUT_MS = 10_000;

export interface NoulQuestion {
  /** A pergunta de sim/não. */
  instructions: string;
  /** O que significa sim e o que significa não. Opcional, mas afia a resposta. */
  criteria?: { true: string; false: string };
}

export type TypeSafeResponse<K extends string> =
  | { success: true; answers: Record<K, number> }
  | { success: false; error: { code: string; message: string } };

export function isTypeSafeConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

interface ApiAnswer {
  type: string;
  noul?: number;
}

/**
 * Faz N perguntas de sim/não sobre o MESMO estado, numa requisição.
 *
 * As perguntas são avaliadas em paralelo e não se veem — o que é exatamente o
 * necessário aqui: cada tema candidato é julgado por si, sem que a resposta de
 * um contamine a do outro.
 *
 * Nunca lança. Um fornecedor externo no caminho de uma rota não pode derrubá-la:
 * quem chama decide o que fazer com a falha, e no roteamento o fallback é o
 * comportamento atual (o agrupamento em lote).
 */
export async function askNouls<K extends string>(
  state: unknown,
  questions: Record<K, NoulQuestion>,
  opts: { model?: string; signal?: AbortSignal } = {}
): Promise<TypeSafeResponse<K>> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: { code: 'NOT_CONFIGURED', message: 'TYPESAFE_API_KEY não definida.' },
    };
  }

  const ids = Object.keys(questions) as K[];
  if (!ids.length) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Nenhuma pergunta.' } };
  }

  const body = {
    state,
    model: opts.model ?? DEFAULT_MODEL,
    questions: Object.fromEntries(
      ids.map((id) => [
        id,
        { type: 'noul', instructions: questions[id].instructions, criteria: questions[id].criteria },
      ])
    ),
  };

  // Timeout próprio: sem ele, um fornecedor lento seguraria a rota inteira.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  // Se quem chamou já tem um signal, aborta junto com ele.
  const onAbort = () => timeout.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        success: false,
        error: {
          code: res.status === 429 ? 'RATE_LIMIT' : res.status === 401 ? 'AUTH' : 'API_ERROR',
          // A chave viaja no header, não no corpo — mas o texto do erro é de
          // terceiro, então fica truncado e nunca vai para a tela.
          message: `TypeSafe respondeu ${res.status}. ${detail.slice(0, 200)}`,
        },
      };
    }

    const json = (await res.json()) as { answers?: Record<string, ApiAnswer> };
    const answers = {} as Record<K, number>;
    for (const id of ids) {
      const raw = json.answers?.[id]?.noul;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return {
          success: false,
          error: { code: 'API_ERROR', message: `Resposta sem probabilidade para "${id}".` },
        };
      }
      answers[id] = raw;
    }

    return { success: true, answers };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      success: false,
      error: {
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        message: aborted
          ? `TypeSafe não respondeu em ${TIMEOUT_MS}ms.`
          : `Falha de rede ao chamar o TypeSafe: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
