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
  estimateTokens,
  MAX_CHUNK_TOKENS,
  chunkTranscription,
} from '../client';
import {
  opportunityBatchSchema,
  OPPORTUNITY_BATCH_SYSTEM_PROMPT,
  createOpportunityBatchPrompt,
  type OpportunityBatchResult,
  type BatchConversationInput,
} from '../prompts/opportunity-batch';

/** Conversa como vem do banco, antes de virar entrada do prompt. */
export interface BatchConversation {
  id: string;
  title: string | null;
  date: string | null;
  transcription: string;
  /** Resumo já gerado no processamento da conversa; base do extrato. */
  summary?: string | null;
  /** JSON string com os tópicos da conversa. */
  topics?: string | null;
}

/** Oportunidade do conjunto, já com as fontes resolvidas para ids reais. */
export interface BatchOpportunity {
  title: string;
  pain: string;
  context: string;
  type: string;
  subtype: string | null;
  score: number;
  sources: BatchSource[];
}

export interface BatchSource {
  conversationId: string;
  excerpt: string | null;
  /**
   * `true` só quando o trecho foi localizado na transcrição e é, portanto, fala
   * de alguém na reunião. `false` quando é texto do resumo — paráfrase da IA.
   * A distinção existe porque o modal apresenta um como citação e o outro não:
   * exibir paráfrase entre aspas faz o usuário defender numa reunião comercial
   * uma frase que ninguém disse.
   */
  fromTranscription: boolean;
}

export type BatchAnalyzeResponse =
  | { success: true; data: BatchOpportunity[]; groups: number }
  | { success: false; error: { code: string; message: string; details?: unknown } };

/**
 * Analisa um CONJUNTO de conversas e devolve oportunidades com múltiplas fontes.
 *
 * A cota por minuto da Azure é apertada (TOKENS_PER_MINUTE), então o conjunto é
 * quebrado em grupos que cabem numa requisição. Cada grupo é analisado
 * sequencialmente e os resultados são mesclados por título — uma dor que
 * aparece em grupos diferentes vira UMA oportunidade com as fontes somadas.
 *
 * Uma conversa grande demais para caber sozinha num grupo tem a transcrição
 * truncada no primeiro chunk que cabe: é melhor analisar o começo dela junto do
 * conjunto do que descartá-la.
 */
export async function analyzeOpportunityBatch(
  items: BatchConversation[]
): Promise<BatchAnalyzeResponse> {
  if (!items.length) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Nenhuma conversa para analisar.' },
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

  const { groups, form } = planGroups(items);
  console.log(
    `[AI] Análise em conjunto: ${items.length} conversa(s) em ${groups.length} grupo(s), material=${form}.`
  );

  // Acumulador global: a mesma dor em grupos diferentes precisa virar uma
  // oportunidade só, com as fontes de todos os grupos.
  const merged = new Map<string, BatchOpportunity>();
  // Para reancorar o trecho na transcrição quando a análise usou o resumo.
  const byId = new Map(items.map((i) => [i.id, i]));

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    // ref é local ao grupo (C1, C2...) porque o modelo só vê este grupo.
    const refToId = new Map<string, string>();
    const inputs: BatchConversationInput[] = group.map((c, idx) => {
      const ref = `C${idx + 1}`;
      refToId.set(ref, c.id);
      return {
        ref,
        title: c.title,
        date: c.date,
        content: form === 'resumo' ? buildDigest(c) : c.transcription,
        form,
      };
    });

    console.log(`[AI] Analisando grupo ${i + 1}/${groups.length} (${group.length} conversa(s))...`);
    const res = await runGroup(inputs);
    if (!res.success) return res;

    let dropped = 0;
    for (const opp of res.data.opportunities) {
      const key = opp.title.trim().toLowerCase();
      // Só aceita refs que existem neste grupo — o modelo às vezes inventa.
      const sources = opp.sources
        .map((s) => {
          // O modelo alterna entre "C1" e "[C1]" — normaliza antes de resolver.
          const ref = s.conversationRef.trim().toUpperCase().replace(/[[\]]/g, '');
          const conversationId = refToId.get(ref) ?? null;
          const raw = s.excerpt?.trim() ? s.excerpt.trim() : null;
          // No modo resumo o excerpt vem do resumo, não da fala. Tenta trocar
          // pela passagem correspondente da transcrição, que é o que o usuário
          // quer ver no modal.
          const source = conversationId ? byId.get(conversationId) : undefined;

          if (form !== 'resumo') {
            // Modo transcrição: o modelo leu a fala, então o excerpt já é fala.
            return { conversationId, excerpt: raw, fromTranscription: !!raw };
          }

          const ancorado = raw && source ? findInTranscription(source.transcription, raw) : null;
          return {
            conversationId,
            excerpt: ancorado ?? raw,
            fromTranscription: !!ancorado,
          };
        })
        .filter((s): s is BatchSource & { conversationId: string } => !!s.conversationId);

      // Sem fonte válida a oportunidade não é rastreável — descarta.
      if (!sources.length) {
        dropped++;
        continue;
      }

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          title: opp.title.trim(),
          pain: opp.pain,
          context: opp.context,
          type: opp.type,
          subtype: opp.subtype?.trim() ? opp.subtype.trim() : null,
          score: opp.score,
          sources,
        });
        continue;
      }

      // Mescla: mantém o score mais alto e soma as fontes sem duplicar conversa.
      const seen = new Set(existing.sources.map((s) => s.conversationId));
      for (const s of sources) {
        if (seen.has(s.conversationId)) continue;
        seen.add(s.conversationId);
        existing.sources.push(s);
      }
      if (opp.score > existing.score) {
        existing.score = opp.score;
        existing.pain = opp.pain;
        existing.context = opp.context;
      }
    }

    // Sem isso, um grupo que devolve tudo com ref inválido some sem deixar rastro.
    console.log(
      `[AI] Grupo ${i + 1}: ${res.data.opportunities.length} da IA, ${dropped} sem fonte válida.`
    );
  }

  // O prompt exige recorrência, mas o modelo às vezes devolve a dor isolada mesmo
  // assim — foi o que encheu o banco de oportunidades de fonte única. A regra vale
  // no código, não só na instrução. Conjunto de uma conversa só é a exceção: ali
  // não há como haver recorrência e a análise individual é o que o usuário pediu.
  const requireRecurrence = items.length > 1;
  const all = [...merged.values()];
  const data = (requireRecurrence ? all.filter((o) => o.sources.length >= 2) : all).sort((a, b) => {
    // Recorrência primeiro (é o ponto de analisar em conjunto), score como desempate.
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length;
    return b.score - a.score;
  });

  if (requireRecurrence && all.length !== data.length) {
    console.log(
      `[AI] ${all.length - data.length} oportunidade(s) descartada(s) por terem uma única conversa de origem.`
    );
  }

  return { success: true, data, groups: groups.length };
}

/** Quanto do resumo entra no extrato. O começo é onde o contexto está. */
const DIGEST_SUMMARY_CHARS = 1200;

/** Palavras curtas e comuns não distinguem uma passagem de outra. */
const STOP_WORDS = new Set([
  'para', 'com', 'que', 'uma', 'dos', 'das', 'nos', 'nas', 'por', 'mais',
  'como', 'sobre', 'entre', 'quando', 'onde', 'isso', 'este', 'esta', 'esse',
  'essa', 'seu', 'sua', 'ele', 'ela', 'foi', 'ser', 'ter', 'tem', 'não',
  'sim', 'the', 'and', 'são', 'está', 'estão', 'pela', 'pelo',
]);

/**
 * Acha na transcrição a passagem que corresponde a uma frase do resumo.
 *
 * Quando a análise roda sobre extratos, o excerpt devolvido é do resumo — texto
 * da IA, não fala do participante. O modal precisa mostrar de onde a coisa saiu,
 * então procura-se na transcrição a janela com mais palavras-chave em comum.
 * Sem correspondência boa devolve null, e o chamador mantém o texto do resumo.
 */
function findInTranscription(transcription: string, phrase: string): string | null {
  const keywords = [
    ...new Set(
      phrase
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    ),
  ];
  if (keywords.length < 2) return null;

  // Frases da transcrição, agrupadas de 3 em 3 para dar contexto ao trecho.
  const sentences = transcription
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  if (!sentences.length) return null;

  const WINDOW = 3;
  let best: { text: string; hits: number } | null = null;

  for (let i = 0; i <= sentences.length - 1; i++) {
    const text = sentences.slice(i, i + WINDOW).join(' ');
    const hay = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const hits = keywords.filter((k) => hay.includes(k)).length;
    if (!best || hits > best.hits) best = { text, hits };
  }

  // Exige metade das palavras-chave: abaixo disso é coincidência, e um trecho
  // errado no modal é pior que o texto do resumo.
  if (!best || best.hits < Math.max(2, Math.ceil(keywords.length / 2))) return null;
  return best.text.length > 600 ? `${best.text.slice(0, 600)}…` : best.text;
}

/**
 * Extrato compacto da conversa: tópicos + início do resumo.
 *
 * Cabe ~350 tokens, contra ~2.000+ de uma transcrição. É isso que permite pôr
 * dezenas de reuniões na MESMA requisição — sem isso não existe "dor recorrente
 * no período", só análise conversa a conversa.
 */
function buildDigest(c: BatchConversation): string {
  const parts: string[] = [];

  let topics: string[] = [];
  try {
    const parsed = c.topics ? JSON.parse(c.topics) : null;
    if (Array.isArray(parsed)) topics = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    // topics é JSON string vinda do banco; se vier corrompida, segue sem ela.
  }
  if (topics.length) parts.push(`Tópicos: ${topics.join('; ')}`);

  const summary = (c.summary ?? '').trim();
  if (summary) {
    parts.push(
      summary.length > DIGEST_SUMMARY_CHARS
        ? `${summary.slice(0, DIGEST_SUMMARY_CHARS)}…`
        : summary
    );
  }

  // Sem resumo nem tópicos, o começo da transcrição é o que sobra.
  if (!parts.length) parts.push(c.transcription.slice(0, DIGEST_SUMMARY_CHARS));

  return parts.join('\n\n');
}

/**
 * Decide COMO analisar o conjunto e distribui em grupos que cabem no orçamento.
 *
 * Preferência: transcrições integrais, que dão o trecho literal. Mas a cota por
 * minuto da Azure é apertada e uma reunião de uma hora sozinha já a estoura —
 * insistir nas transcrições faria cada conversa virar um grupo só dela, e a IA
 * nunca veria duas juntas. Nesse caso troca-se profundidade por visão de
 * conjunto: manda o extrato de todas, que é o ponto de analisar por período.
 */
function planGroups(items: BatchConversation[]): {
  groups: BatchConversation[][];
  form: 'transcricao' | 'resumo';
} {
  const fitsWhole =
    items.reduce((sum, i) => sum + estimateTokens(i.transcription), 0) <= MAX_CHUNK_TOKENS;

  // Conjunto pequeno: cabe inteiro, análise na profundidade máxima.
  if (fitsWhole) return { groups: [items], form: 'transcricao' };

  // Uma conversa só que não cabe: trunca, mas segue com a transcrição — não há
  // conjunto para enxergar e o trecho literal vale mais que o extrato.
  if (items.length === 1) {
    const [head] = chunkTranscription(items[0].transcription);
    console.warn(`[AI] Conversa ${items[0].id} excede o orçamento — analisando só o primeiro trecho.`);
    return { groups: [[{ ...items[0], transcription: head }]], form: 'transcricao' };
  }

  return { groups: packByTokens(items, (c) => buildDigest(c)), form: 'resumo' };
}

/** Empacota as conversas em grupos que cabem no orçamento de tokens. */
function packByTokens(
  items: BatchConversation[],
  render: (c: BatchConversation) => string
): BatchConversation[][] {
  const groups: BatchConversation[][] = [];
  let current: BatchConversation[] = [];
  let currentTokens = 0;

  for (const item of items) {
    const tokens = estimateTokens(render(item));
    if (current.length && currentTokens + tokens > MAX_CHUNK_TOKENS) {
      groups.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(item);
    currentTokens += tokens;
  }

  if (current.length) groups.push(current);
  return groups;
}

/**
 * Uma requisição para um grupo, com o mesmo loop de retry do
 * transcription-processor: 429 tem orçamento próprio de esperas, erros
 * genéricos usam backoff exponencial.
 */
async function runGroup(
  inputs: BatchConversationInput[]
): Promise<
  { success: true; data: OpportunityBatchResult } | { success: false; error: { code: string; message: string; details?: unknown } }
> {
  const maxRetries = RETRY_CONFIG.maxRetries;
  let rateLimitWaits = 0;
  let attempt = 0;
  let lastError: unknown;

  while (true) {
    try {
      const { object, finishReason } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: opportunityBatchSchema,
        system: OPPORTUNITY_BATCH_SYSTEM_PROMPT,
        prompt: createOpportunityBatchPrompt(inputs),
        maxRetries: 0,
      });

      if (finishReason === 'length') {
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message:
              'Resposta truncada (finish_reason=length) — o conjunto gerou saída grande demais. Selecione menos conversas.',
          },
        };
      }

      return { success: true, data: object };
    } catch (error) {
      lastError = error;
      console.error(`[AI] Grupo: tentativa ${attempt + 1}/${maxRetries + 1} falhou:`, error);

      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          return {
            success: false,
            error: { code: 'API_ERROR', message: 'Falha de autenticação na IA — verifique a API key.' },
          };
        }
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
        : 'Falha ao analisar o conjunto de conversas.',
      details: detail,
    },
  };
}
