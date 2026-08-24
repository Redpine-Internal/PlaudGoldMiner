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
  checkTokenBudget,
  needsChunking,
  chunkTranscription,
} from '../client';
import {
  transcriptionResultSchema,
  TRANSCRIPTION_SYSTEM_PROMPT,
  createUserPrompt,
  type TranscriptionResult,
} from '../prompts/process-transcription';

export interface ProcessTranscriptionOptions {
  maxRetries?: number;
  timeout?: number;
}

export interface ProcessTranscriptionError {
  code: 'API_ERROR' | 'VALIDATION_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'UNKNOWN';
  message: string;
  details?: unknown;
}

export type ProcessTranscriptionResponse =
  | { success: true; data: TranscriptionResult }
  | { success: false; error: ProcessTranscriptionError };

/**
 * Process a transcription using Claude AI to extract structured insights.
 *
 * Transcriptions whose input would exceed Azure's per-minute token quota are
 * split into chunks, each analyzed separately (sequentially, to respect the
 * rate limit), and the partial results merged into one. Short transcriptions
 * take the single-request fast path unchanged.
 */
export async function processTranscription(
  transcription: string,
  options: ProcessTranscriptionOptions = {}
): Promise<ProcessTranscriptionResponse> {
  // Validate input
  if (!transcription || transcription.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Transcription text is required',
      },
    };
  }

  // Check for Azure OpenAI credentials
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

  // Alert #1: above 272K input tokens Azure doubles the per-request price.
  // Warn (don't block) so a huge transcription is a conscious cost, not a surprise.
  const { warning } = checkTokenBudget(transcription);
  if (warning) {
    console.warn(`[AI] ${warning}`);
  }

  // Fast path: fits in one request.
  if (!needsChunking(transcription)) {
    return processChunk(transcription, options);
  }

  // Too big for one request — split, analyze each chunk sequentially (so we
  // don't blow the per-minute quota with parallel calls), and merge.
  const chunks = chunkTranscription(transcription);
  console.log(`[AI] Transcription split into ${chunks.length} chunks to fit the token quota.`);

  const partials: TranscriptionResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[AI] Processing chunk ${i + 1}/${chunks.length}...`);
    const res = await processChunk(chunks[i], options);
    if (!res.success) {
      // Propagate the first failing chunk's error (already user-friendly for
      // rate limits). Partial progress is discarded — a half-analyzed
      // transcription would produce misleading opportunities.
      return res;
    }
    partials.push(res.data);
  }

  return { success: true, data: mergeResults(partials) };
}

/**
 * Analyze a single transcription (or chunk) in one request, with the
 * rate-limit-aware retry loop. Assumes input already fits the token quota.
 */
async function processChunk(
  transcription: string,
  options: ProcessTranscriptionOptions = {}
): Promise<ProcessTranscriptionResponse> {
  const { maxRetries = RETRY_CONFIG.maxRetries } = options;
  // Separate budget for 429s: each rate-limit wait can be ~60s, so we allow only
  // a small number before failing fast (see RETRY_CONFIG.maxRateLimitWaits).
  let rateLimitWaits = 0;
  const { tokens } = checkTokenBudget(transcription);

  let lastError: unknown;

  // `attempt` counts generic (non-429) failures against maxRetries. Rate-limit
  // failures don't burn this budget — they're bounded separately by
  // rateLimitWaits so a 429 can't be masked as a transient error and vice-versa.
  let attempt = 0;
  while (true) {
    try {
      const { object, finishReason } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: transcriptionResultSchema,
        system: TRANSCRIPTION_SYSTEM_PROMPT,
        prompt: createUserPrompt(transcription),
        // Disable the SDK's built-in retry (default 2). Its retries fire with a
        // short backoff *inside* the same throttled 60s window and always fail,
        // masking Azure's `retry-after`. We own retries in this loop instead so
        // a 429 waits out the real quota window (see getRateLimitDelay).
        maxRetries: 0,
      });

      // Alert #2: a truncated response returns finishReason 'length', not an
      // error. The parsed object may be incomplete — treat it as a failure.
      if (finishReason === 'length') {
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message:
              'Resposta truncada (finish_reason=length) — contexto/saída estourou. Reduza a transcrição.',
            details: { estimatedInputTokens: tokens },
          },
        };
      }

      return {
        success: true,
        data: object,
      };
    } catch (error) {
      lastError = error;
      console.error(`[AI] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);

      // Don't retry on certain errors
      if (error instanceof Error) {
        // Truncation surfaced as an error (NoObjectGeneratedError w/ length).
        // Retrying the same input just truncates again — fail fast.
        if (error.message.includes('length') && error.message.toLowerCase().includes('finish')) {
          return {
            success: false,
            error: {
              code: 'API_ERROR',
              message:
                'Resposta truncada (finish_reason=length) — contexto/saída estourou. Reduza a transcrição.',
              details: error.message,
            },
          };
        }

        // Don't retry on validation errors
        if (error.message.includes('validation')) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'AI response validation failed',
              details: error.message,
            },
          };
        }

        // Don't retry on auth errors
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('authentication')) {
          return {
            success: false,
            error: {
              code: 'API_ERROR',
              message: 'Authentication failed - check your API key',
              details: error.message,
            },
          };
        }
      }

      const rateLimited = isRateLimitError(error);

      if (rateLimited) {
        // A 429 means Azure's per-minute token quota is spent. Each wait can be
        // a full ~60s window, so cap how many we ride out — otherwise the HTTP
        // request blocks for minutes and hits the serverless timeout. Once the
        // budget is spent, stop and surface the clear message for a manual retry.
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
        continue; // don't burn the generic retry budget on a 429
      }

      // Generic/transient error: exponential backoff against maxRetries.
      if (attempt >= maxRetries) break;
      const delay = getRetryDelay(attempt);
      console.log(`[AI] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delay);
      attempt++;
    }
  }

  // All retries exhausted. Azure returns 429 / "exceeded rate limit" when the
  // per-minute token quota (gpt-5.6-terra: 10k tokens/min) is spent — surface a
  // clear, actionable message instead of a generic failure.
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const isRateLimited = isRateLimitError(lastError);
  return {
    success: false,
    error: {
      code: isRateLimited ? 'RATE_LIMIT' : 'API_ERROR',
      message: isRateLimited
        ? 'Limite de uso da IA atingido (cota por minuto do Azure). Aguarde cerca de 1 minuto e tente novamente.'
        : `Failed after ${maxRetries + 1} attempts`,
      details: detail,
    },
  };
}

/** Case-insensitive, order-preserving dedupe of a string list. */
function dedupeStrings(items: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return limit ? out.slice(0, limit) : out;
}

const SEVERITY_RANK: Record<'baixa' | 'media' | 'alta', number> = { baixa: 0, media: 1, alta: 2 };

/**
 * Merge per-chunk structured results into one. Field-by-field:
 *   summary        — concatenated with headers (one section per chunk).
 *   topics/parts   — unioned + deduped (topics capped at 10 like the schema).
 *   opportunities  — concatenated, deduped by title, kept in score order.
 *   problems       — merged by description: mentions summed, max severity kept.
 *   suggestedTitle — from the first chunk (conversation opening sets the theme).
 *   suggestedType  — most frequent across chunks.
 */
function mergeResults(parts: TranscriptionResult[]): TranscriptionResult {
  if (parts.length === 1) return parts[0];

  const summary = parts
    .map((p, i) => `**Parte ${i + 1}**\n\n${p.summary}`)
    .join('\n\n');

  const topics = dedupeStrings(parts.flatMap((p) => p.topics), 10);
  const participants = dedupeStrings(parts.flatMap((p) => p.participants));

  // Opportunities: dedupe by normalized title, keep the highest-scoring instance.
  const oppByTitle = new Map<string, TranscriptionResult['opportunities'][number]>();
  for (const opp of parts.flatMap((p) => p.opportunities)) {
    const key = opp.title.trim().toLowerCase();
    const existing = oppByTitle.get(key);
    if (!existing || opp.score > existing.score) oppByTitle.set(key, opp);
  }
  const opportunities = [...oppByTitle.values()].sort((a, b) => b.score - a.score);

  // Problems: merge by description, sum mentions, take the max severity.
  const probByDesc = new Map<string, TranscriptionResult['problems'][number]>();
  for (const prob of parts.flatMap((p) => p.problems)) {
    const key = prob.description.trim().toLowerCase();
    const existing = probByDesc.get(key);
    if (!existing) {
      probByDesc.set(key, { ...prob });
    } else {
      existing.mentions += prob.mentions;
      if (SEVERITY_RANK[prob.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = prob.severity;
      }
    }
  }
  const problems = [...probByDesc.values()].sort((a, b) => b.mentions - a.mentions);

  // suggestedType: most frequent across chunks (ties → first chunk's value).
  const typeCounts = new Map<TranscriptionResult['suggestedType'], number>();
  for (const p of parts) typeCounts.set(p.suggestedType, (typeCounts.get(p.suggestedType) || 0) + 1);
  const suggestedType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return {
    summary,
    topics,
    participants,
    opportunities,
    problems,
    suggestedTitle: parts[0].suggestedTitle,
    suggestedType,
  };
}
