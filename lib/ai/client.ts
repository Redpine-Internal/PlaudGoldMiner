import { createAzure } from '@ai-sdk/azure';
import { APICallError } from '@ai-sdk/provider';

// Azure OpenAI provider. The app talks to a GPT deployment on Azure OpenAI
// (e.g. `gpt-5.6-terra`), not the direct Anthropic API.
//
// Required env:
//   AZURE_OPENAI_RESOURCE_NAME  — resource name, used in the URL
//                                 https://{resource}.openai.azure.com
//   AZURE_OPENAI_API_KEY        — API key for the resource
//   AZURE_OPENAI_DEPLOYMENT     — deployment (model) name, e.g. gpt-5.6-terra
// Optional:
//   AZURE_OPENAI_BASE_URL       — full base URL, overrides resource name
//                                 (use for proxies / custom gateways)
//   AZURE_OPENAI_API_VERSION    — API version (defaults to provider default)
export const azure = createAzure({
  resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_BASE_URL || undefined,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || undefined,
});

// The model id passed to `azure(...)` is the Azure *deployment* name.
export const DEFAULT_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.6-terra';

// Backwards-compatible alias: services call `anthropic(DEFAULT_MODEL)`.
// It now resolves to the Azure provider. Kept as an alias to avoid touching
// every call site; safe to rename to `azure` in the services later.
export const anthropic = azure;

// True when Azure OpenAI credentials are present. Services should gate on this
// instead of ANTHROPIC_API_KEY.
export function isAiConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_API_KEY &&
      (process.env.AZURE_OPENAI_RESOURCE_NAME || process.env.AZURE_OPENAI_BASE_URL)
  );
}

// --- Token accounting -------------------------------------------------------
// Alert threshold: above 272K input tokens Azure doubles the per-request price
// ($2->$4 in, $12->$18 out) for gpt-5.6-terra. Count before sending.
export const TOKEN_PRICE_DOUBLING_THRESHOLD = 272_000;

// Rough token estimate. Not exact (no tokenizer dependency) — deliberately
// conservative: ~3.5 chars/token for pt-BR text, which over-counts slightly so
// the doubling warning fires early rather than late.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// Returns a warning string if the input is likely to cross the price-doubling
// threshold, otherwise null.
export function checkTokenBudget(text: string): { tokens: number; warning: string | null } {
  const tokens = estimateTokens(text);
  const warning =
    tokens > TOKEN_PRICE_DOUBLING_THRESHOLD
      ? `Input ~${tokens.toLocaleString()} tokens excede ${TOKEN_PRICE_DOUBLING_THRESHOLD.toLocaleString()} — preço da requisição dobra na Azure.`
      : null;
  return { tokens, warning };
}

// --- Chunking budget --------------------------------------------------------
// Azure's deployment enforces a per-minute TOKEN quota (gpt-5.6-terra: 10k
// tokens/min). A single long transcription's input alone can exceed it, so we
// split it into chunks that each fit — input + fixed prompt overhead + the
// structured output must all stay under the window.
//
//   TOKENS_PER_MINUTE  the deployment's TPM ceiling (override via env).
//   OUTPUT_RESERVE     tokens we reserve for the model's structured answer.
//   PROMPT_OVERHEAD    system prompt + user-prompt wrapper (~measured).
//   SAFETY_MARGIN      headroom so our ~3.5 char/token estimate under-counting
//                      can't tip a chunk over the real limit.
export const TOKENS_PER_MINUTE = Number(process.env.AZURE_OPENAI_TPM) || 10_000;
const OUTPUT_RESERVE = 2_500;
const PROMPT_OVERHEAD = 400;
const SAFETY_MARGIN = 700;

// Max transcription tokens per chunk that still leaves room for prompt+output.
export const MAX_CHUNK_TOKENS = Math.max(
  1_000,
  TOKENS_PER_MINUTE - OUTPUT_RESERVE - PROMPT_OVERHEAD - SAFETY_MARGIN
);

// True when a transcription's estimated input won't fit one request and must be
// chunked. Compares the *full* request cost (transcription + overhead + output).
export function needsChunking(text: string): boolean {
  return estimateTokens(text) + PROMPT_OVERHEAD + OUTPUT_RESERVE > TOKENS_PER_MINUTE - SAFETY_MARGIN;
}

// Split a transcription into chunks that each fit MAX_CHUNK_TOKENS. Splits on
// paragraph/line boundaries where possible (keeps speaker turns intact); falls
// back to hard character slicing only for a single oversized line.
export function chunkTranscription(text: string, maxTokens = MAX_CHUNK_TOKENS): string[] {
  const maxChars = Math.floor(maxTokens * 3.5); // inverse of estimateTokens
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    // A single line larger than a whole chunk: flush, then hard-slice the line.
    if (line.length > maxChars) {
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      for (let i = 0; i < line.length; i += maxChars) {
        chunks.push(line.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = buf ? `${buf}\n${line}` : line;
    if (candidate.length > maxChars) {
      chunks.push(buf);
      buf = line;
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// Default timeout for AI requests (60 seconds)
export const DEFAULT_TIMEOUT = 60000;

// Retry configuration. Azure OpenAI enforces a per-minute token quota (TPM);
// once spent, requests 429 for the rest of that 60s window. A short 10s backoff
// always retried *inside* the same throttled minute and failed.
//
// Two budgets:
//   maxRetries        — generic/transient errors (fast exponential backoff)
//   maxRateLimitWaits — 429s specifically. Each wait can be ~60s (a full quota
//                       window), so this is kept small (1) to ride out one reset
//                       without blocking the HTTP request for minutes. If the
//                       quota is still spent after that, fail fast with a clear
//                       message and let the user retry manually.
export const RETRY_CONFIG = {
  maxRetries: 3,
  maxRateLimitWaits: 1,
  baseDelay: 1000, // 1 second
  maxDelay: 65_000, // 65s — just past Azure's 60s quota window
};

// Utility for exponential backoff delay
export function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

// True when an error is an Azure rate-limit (HTTP 429).
export function isRateLimitError(error: unknown): boolean {
  if (APICallError.isInstance(error) && error.statusCode === 429) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /rate limit|429|too many requests/i.test(msg);
}

// How long to wait after a 429, in ms. Prefers the server's own guidance:
//   `retry-after` (seconds) or `retry-after-ms` from the response headers.
// Azure sends these on throttle. Falls back to the exponential backoff, and is
// always clamped to maxDelay so a bogus header can't stall us for minutes.
export function getRateLimitDelay(error: unknown, attempt: number): number {
  let hinted: number | null = null;
  if (APICallError.isInstance(error) && error.responseHeaders) {
    const h = error.responseHeaders;
    // Azure sends both; `retry-after-ms` is sometimes '0' (bogus) while
    // `retry-after` (seconds) carries the real wait — so only trust a positive
    // value from each, preferring the ms header when it's genuinely set.
    const ms = Number(h['retry-after-ms']);
    const secs = Number(h['retry-after']);
    if (Number.isFinite(ms) && ms > 0) hinted = ms;
    else if (Number.isFinite(secs) && secs > 0) hinted = secs * 1000;
  }
  // Add a 1s cushion so we land just *after* the window reopens, not on its edge.
  const delay = hinted != null ? hinted + 1000 : getRetryDelay(attempt);
  return Math.min(Math.max(delay, RETRY_CONFIG.baseDelay), RETRY_CONFIG.maxDelay);
}

// Sleep utility for retry delays
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
