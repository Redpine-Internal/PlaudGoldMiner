/**
 * Busca na web (Exa).
 *
 * Existe por um motivo específico: nenhum modelo sabe quem vende o quê no
 * mercado brasileiro hoje. Perguntar isso a um LLM devolve conhecimento dos
 * pesos — genérico, sem data e sem fonte — com cara de resposta pesquisada.
 * Aqui a busca traz páginas reais e datadas, e o julgamento vem depois, sobre
 * o que foi encontrado.
 */

const ENDPOINT = 'https://api.exa.ai/search';
/** Uma busca leva ~1,5s; acima disso é melhor devolver o tema sem cenário. */
const TIMEOUT_MS = 20_000;

export interface SearchHit {
  title: string;
  url: string;
  /** Trecho da página. É o que o julgamento lê — sem ele só há títulos. */
  text: string;
}

export type SearchResponse =
  | { success: true; hits: SearchHit[]; costDollars: number }
  | { success: false; error: { code: string; message: string } };

export function isExaConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

export async function searchWeb(
  query: string,
  opts: { numResults?: number; maxChars?: number; signal?: AbortSignal } = {}
): Promise<SearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'EXA_API_KEY não definida.' } };
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: opts.numResults ?? 8,
        // 'auto' deixa o Exa escolher entre busca neural e por palavra-chave.
        type: 'auto',
        contents: { text: { maxCharacters: opts.maxChars ?? 500 } },
      }),
      signal: timeout.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        success: false,
        error: {
          code: res.status === 429 ? 'RATE_LIMIT' : res.status === 401 ? 'AUTH' : 'API_ERROR',
          message: `Exa respondeu ${res.status}. ${detail.slice(0, 200)}`,
        },
      };
    }

    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; text?: string }>;
      costDollars?: { total?: number };
    };

    return {
      success: true,
      hits: (json.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        text: (r.text ?? '').replace(/\s+/g, ' ').trim(),
      })),
      costDollars: json.costDollars?.total ?? 0,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      success: false,
      error: {
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        message: aborted
          ? `Exa não respondeu em ${TIMEOUT_MS}ms.`
          : `Falha de rede: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
