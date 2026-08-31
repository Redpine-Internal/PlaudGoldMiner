import { generateObject } from 'ai';
import {
  anthropic,
  DEFAULT_MODEL,
  RETRY_CONFIG,
  getRetryDelay,
  getRateLimitDelay,
  isRateLimitError,
  sleep,
  isAiConfigured,
} from '../client';
import {
  businessThemeSchema,
  BUSINESS_THEME_SYSTEM_PROMPT,
  createBusinessThemePrompt,
  type BusinessThemeResult,
  type BusinessThemeInput,
} from '../prompts/business-theme';

/** Negócio como vem do banco, antes de virar entrada do prompt. */
export interface ThemeCandidate {
  id: string;
  title: string;
  type: string | null;
  subtype: string | null;
}

/** Tema com os negócios já resolvidos para ids reais. */
export interface GroupedTheme {
  name: string;
  rationale: string;
  opportunityIds: string[];
}

export type GroupThemesResponse =
  | { success: true; data: GroupedTheme[] }
  | { success: false; error: { code: string; message: string; details?: unknown } };

/**
 * Só os títulos vão para o modelo, então o conjunto inteiro cabe numa
 * requisição com folga mesmo com a cota apertada da Azure. Acima disso o custo
 * de uma resposta truncada é alto (o agrupamento fica pela metade), então
 * preferimos recusar e deixar o chamador decidir.
 */
const MAX_ITEMS = 120;

/**
 * Agrupa os negócios em temas usando UMA chamada de IA.
 *
 * O resultado é caro o suficiente para ser cacheado pelo chamador — ver
 * app_business_themes / app_business_theme_members. Esta função não toca no
 * banco; ela só transforma títulos em temas.
 */
export async function groupBusinessThemes(
  items: ThemeCandidate[]
): Promise<GroupThemesResponse> {
  if (!items.length) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Nenhum negócio para agrupar.' },
    };
  }

  if (items.length > MAX_ITEMS) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Agrupamento aceita no máximo ${MAX_ITEMS} negócios por vez (recebeu ${items.length}).`,
      },
    };
  }

  if (!isAiConfigured()) {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message:
          'Azure OpenAI não configurado — defina AZURE_OPENAI_API_KEY e AZURE_OPENAI_RESOURCE_NAME (ou AZURE_OPENAI_BASE_URL)',
      },
    };
  }

  const refToId = new Map<string, string>();
  const inputs: BusinessThemeInput[] = items.map((o, idx) => {
    const ref = `N${idx + 1}`;
    refToId.set(ref, o.id);
    return { ref, title: o.title, type: o.type, subtype: o.subtype };
  });

  const res = await runGrouping(inputs);
  if (!res.success) return res;

  return { success: true, data: resolveThemes(res.data, refToId, items) };
}

/**
 * Converte os refs do modelo em ids reais e garante a invariante que a tela
 * depende: cada negócio em exatamente um tema.
 *
 * O modelo erra de três jeitos, todos observados em modelos desta classe:
 * inventa um ref que não existe, repete o mesmo negócio em dois temas, e
 * esquece negócios no fim da lista. Os três são corrigidos aqui — se ficassem
 * para a tela, um negócio sumiria da visão "Por tema" sem deixar rastro.
 */
function resolveThemes(
  result: BusinessThemeResult,
  refToId: Map<string, string>,
  items: ThemeCandidate[]
): GroupedTheme[] {
  const claimed = new Set<string>();
  const themes: GroupedTheme[] = [];

  for (const theme of result.themes) {
    const name = theme.name.trim();
    if (!name) continue;

    const opportunityIds: string[] = [];
    for (const raw of theme.opportunityRefs) {
      // O modelo alterna entre "N1" e "[N1]" — normaliza antes de resolver.
      const ref = raw.trim().toUpperCase().replace(/[[\]]/g, '');
      const id = refToId.get(ref);
      // Ref inventado, ou negócio que um tema anterior já levou: o primeiro
      // tema fica com ele, que é a ordem em que o modelo os apresentou.
      if (!id || claimed.has(id)) continue;
      claimed.add(id);
      opportunityIds.push(id);
    }

    if (!opportunityIds.length) continue;
    themes.push({ name, rationale: theme.rationale.trim(), opportunityIds });
  }

  // Esquecidos viram cada um seu próprio tema, com o próprio título por nome.
  // Melhor um tema de um card do que um card que desapareceu da tela.
  const orphans = items.filter((o) => !claimed.has(o.id));
  if (orphans.length) {
    console.log(`[AI] Agrupamento: ${orphans.length} negócio(s) sem tema, virando tema próprio.`);
    for (const o of orphans) {
      themes.push({
        name: o.subtype?.trim() || o.title,
        rationale: '',
        opportunityIds: [o.id],
      });
    }
  }

  // Tema com mais negócios primeiro: é o que a tela mostra no topo, e é a
  // recorrência que justifica perseguir.
  return themes.sort((a, b) => b.opportunityIds.length - a.opportunityIds.length);
}

/**
 * Uma requisição, com o mesmo loop de retry do batch-analyzer: 429 tem
 * orçamento próprio de esperas, erros genéricos usam backoff exponencial.
 */
async function runGrouping(
  inputs: BusinessThemeInput[]
): Promise<
  | { success: true; data: BusinessThemeResult }
  | { success: false; error: { code: string; message: string; details?: unknown } }
> {
  const maxRetries = RETRY_CONFIG.maxRetries;
  let rateLimitWaits = 0;
  let attempt = 0;
  let lastError: unknown;

  while (true) {
    try {
      const { object, finishReason } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: businessThemeSchema,
        system: BUSINESS_THEME_SYSTEM_PROMPT,
        prompt: createBusinessThemePrompt(inputs),
        maxRetries: 0,
      });

      if (finishReason === 'length') {
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message:
              'Resposta truncada (finish_reason=length) — negócios demais para um agrupamento só.',
          },
        };
      }

      return { success: true, data: object };
    } catch (error) {
      lastError = error;
      console.error(`[AI] Agrupamento: tentativa ${attempt + 1}/${maxRetries + 1} falhou:`, error);

      if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
        return {
          success: false,
          error: { code: 'API_ERROR', message: 'Falha de autenticação na IA — verifique a API key.' },
        };
      }

      if (isRateLimitError(error)) {
        if (rateLimitWaits >= RETRY_CONFIG.maxRateLimitWaits) break;
        rateLimitWaits++;
        await sleep(getRateLimitDelay(error, attempt));
        continue;
      }

      if (attempt >= maxRetries) break;
      await sleep(getRetryDelay(attempt));
      attempt++;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const rateLimited = isRateLimitError(lastError);
  return {
    success: false,
    error: {
      code: rateLimited ? 'RATE_LIMIT' : 'API_ERROR',
      message: rateLimited
        ? 'Limite de uso da IA atingido (cota por minuto do Azure). Aguarde cerca de 1 minuto e tente novamente.'
        : 'Falha ao agrupar os negócios por tema.',
      details: detail,
    },
  };
}
