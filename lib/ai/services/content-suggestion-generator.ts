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
  contentSuggestionsSchema,
  CONTENT_SUGGESTIONS_SYSTEM_PROMPT,
  createContentSuggestionsPrompt,
  type ContentSuggestionsResult,
} from '../prompts/content-suggestions';

export interface ConversationForContent {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  opportunities: { title: string; pain: string }[];
  problems: { description: string; severity: string }[];
}

type GenerateResult =
  | { success: true; data: ContentSuggestionsResult }
  | { success: false; error: { message: string; code: string } };

/**
 * Generate content-piece suggestions from recurring themes across processed
 * conversations. Mirrors the transcription processor's rate-limit-aware retry
 * loop (respects Azure's per-minute quota via getRateLimitDelay) so a 429 waits
 * out the real window instead of burning attempts inside it.
 */
export async function generateContentSuggestions(
  conversations: ConversationForContent[],
  options: { maxRetries?: number; maxSuggestions?: number } = {}
): Promise<GenerateResult> {
  const { maxRetries = RETRY_CONFIG.maxRetries, maxSuggestions = 6 } = options;

  if (!isAiConfigured()) {
    return {
      success: false,
      error: {
        message:
          'Azure OpenAI não configurado — defina AZURE_OPENAI_API_KEY e AZURE_OPENAI_RESOURCE_NAME (ou AZURE_OPENAI_BASE_URL)',
        code: 'API_ERROR',
      },
    };
  }

  if (conversations.length < 2) {
    return {
      success: false,
      error: {
        message: 'São necessárias ao menos 2 conversas processadas para sugerir conteúdos.',
        code: 'INSUFFICIENT_DATA',
      },
    };
  }

  let lastError: unknown;
  let rateLimitWaits = 0;
  let attempt = 0;

  while (true) {
    try {
      const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: contentSuggestionsSchema,
        system: CONTENT_SUGGESTIONS_SYSTEM_PROMPT,
        prompt: createContentSuggestionsPrompt(conversations, maxSuggestions),
        // Own the retries here so a 429 respects Azure's retry-after (see the
        // transcription processor for the full rationale).
        maxRetries: 0,
      });
      return { success: true, data: object };
    } catch (error) {
      lastError = error;
      console.error(`[AI] Content suggestion attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);

      if (isRateLimitError(error)) {
        if (rateLimitWaits >= RETRY_CONFIG.maxRateLimitWaits) {
          console.warn('[AI] Rate-limit wait budget exhausted — failing fast.');
          break;
        }
        rateLimitWaits++;
        const delay = getRateLimitDelay(error, attempt);
        console.log(
          `[AI] Rate limited (wait ${rateLimitWaits}/${RETRY_CONFIG.maxRateLimitWaits}) — retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      if (attempt >= maxRetries) break;
      const delay = getRetryDelay(attempt);
      console.log(`[AI] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delay);
      attempt++;
    }
  }

  const isRateLimited = isRateLimitError(lastError);
  return {
    success: false,
    error: {
      message: isRateLimited
        ? 'Limite de uso da IA atingido (cota por minuto do Azure). Aguarde cerca de 1 minuto e tente novamente.'
        : 'Falha ao gerar sugestões de conteúdo após várias tentativas.',
      code: isRateLimited ? 'RATE_LIMIT' : 'ANALYSIS_FAILED',
    },
  };
}
