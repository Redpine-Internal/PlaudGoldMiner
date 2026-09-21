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
 * Negócios por requisição. Só título/tipo/subtipo vão ao modelo (~47 chars por
 * negócio), mas a cota da Azure é de 10k tokens/min e a resposta cresce junto
 * com a entrada: acima disso o risco é `finish_reason=length`, que deixa o
 * agrupamento pela metade.
 *
 * Conjuntos maiores não são recusados — são divididos em lotes e consolidados
 * numa segunda passada (ver `groupBusinessThemes`). Recusar era pior: a tela
 * "Por tema" simplesmente parava de atualizar quando o acervo crescia.
 */
const BATCH_SIZE = 80;

/**
 * Teto de segurança. Cada lote é uma chamada à Azure e as chamadas são
 * sequenciais (a cota é por minuto), então um acervo muito grande levaria
 * minutos. Acima disso o chamador decide — filtrar, arquivar ou paginar.
 */
const MAX_ITEMS = 400;

/** Divide em lotes de no máximo `size`, preservando a ordem. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Agrupa os negócios em temas.
 *
 * Até `BATCH_SIZE`, é UMA chamada de IA. Acima disso são duas passadas:
 *   1. cada lote vira temas (chamadas sequenciais, respeitando a cota);
 *   2. os temas de todos os lotes são reagrupados entre si, porque o mesmo
 *      assunto aparece em lotes diferentes com nomes diferentes.
 *
 * A consolidação usa a mesma chamada de agrupamento, tratando cada tema do
 * primeiro passo como um item — são poucos e curtos, então cabe numa
 * requisição. Se ela falhar, os temas do passo 1 são devolvidos como estão:
 * agrupamento parcial ainda é melhor que erro na tela.
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

  const batches = chunk(items, BATCH_SIZE);

  // Caminho simples: cabe numa requisição, sem consolidação.
  if (batches.length === 1) {
    const res = await groupOneBatch(items);
    if (!res.success) return res;
    return { success: true, data: res.data };
  }

  // Passo 1: cada lote vira temas. Sequencial — a cota da Azure é por minuto,
  // então lotes em paralelo só adiantariam o 429.
  const partial: GroupedTheme[] = [];
  for (const [i, batch] of batches.entries()) {
    console.log(`[AI] Agrupamento: lote ${i + 1}/${batches.length} (${batch.length} negócios)...`);
    const res = await groupOneBatch(batch);
    // Um lote que falha não invalida os anteriores: o que já foi agrupado vale.
    // Só propaga o erro se nenhum lote tiver dado certo.
    if (!res.success) {
      if (!partial.length) return res;
      console.error(`[AI] Agrupamento: lote ${i + 1} falhou, seguindo com os anteriores.`);
      continue;
    }
    partial.push(...res.data);
  }

  if (partial.length <= 1) return { success: true, data: partial };

  // Passo 2: o mesmo assunto aparece em lotes diferentes com nomes diferentes
  // ("Gestão de terceiros" no lote 1, "Governança de contratadas" no lote 2).
  // Reagrupa os temas entre si e funde os membros dos que forem o mesmo.
  console.log(`[AI] Agrupamento: consolidando ${partial.length} temas dos lotes...`);
  const merged = await consolidateThemes(partial);
  return { success: true, data: merged };
}

/** Uma requisição de agrupamento sobre um conjunto que cabe em `BATCH_SIZE`. */
async function groupOneBatch(items: ThemeCandidate[]): Promise<GroupThemesResponse> {
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
 * Funde temas equivalentes vindos de lotes diferentes.
 *
 * Trata cada tema como um item de agrupamento (nome = título) e reaproveita a
 * mesma chamada. O resultado diz quais temas são o mesmo; os membros de cada
 * grupo são concatenados sem duplicar negócio.
 *
 * Falha aqui não é fatal: devolve os temas de entrada inalterados. Ver mais
 * temas do que o ideal é melhor que ver um erro.
 */
async function consolidateThemes(themes: GroupedTheme[]): Promise<GroupedTheme[]> {
  const byRef = new Map<string, GroupedTheme>();
  const inputs: BusinessThemeInput[] = themes.map((t, idx) => {
    const ref = `N${idx + 1}`;
    byRef.set(ref, t);
    // O "negócio" aqui é o próprio tema: nome no título, rationale como
    // subtipo — é o que dá ao modelo o contexto do que o tema reúne.
    return { ref, title: t.name, type: null, subtype: t.rationale || null };
  });

  const res = await runGrouping(inputs);
  if (!res.success) {
    console.error('[AI] Consolidação de temas falhou, mantendo os temas dos lotes.');
    return themes;
  }

  const claimed = new Set<string>();
  const out: GroupedTheme[] = [];

  for (const group of res.data.themes) {
    const name = group.name.trim();
    if (!name) continue;

    const opportunityIds: string[] = [];
    const seen = new Set<string>();
    let rationale = group.rationale.trim();

    for (const raw of group.opportunityRefs) {
      const ref = raw.trim().toUpperCase().replace(/[[\]]/g, '');
      const theme = byRef.get(ref);
      if (!theme || claimed.has(ref)) continue;
      claimed.add(ref);
      // Sem rationale próprio, herda o do primeiro tema fundido.
      if (!rationale) rationale = theme.rationale;
      for (const id of theme.opportunityIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        opportunityIds.push(id);
      }
    }

    if (!opportunityIds.length) continue;
    out.push({ name, rationale, opportunityIds });
  }

  // Tema que a consolidação esqueceu continua valendo por si — mesma garantia
  // de `resolveThemes`: nenhum negócio pode sumir da tela.
  for (const [ref, theme] of byRef) {
    if (claimed.has(ref)) continue;
    out.push(theme);
  }

  return out.sort((a, b) => b.opportunityIds.length - a.opportunityIds.length);
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
