import { generateObject } from 'ai';
import { anthropic, DEFAULT_MODEL, RETRY_CONFIG } from '../client';
import {
  crossInsightSchema,
  CrossInsightResult,
  CROSS_INSIGHT_SYSTEM_PROMPT,
  createCrossInsightPrompt,
} from '../prompts/cross-insights';

interface ConversationForAnalysis {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  opportunities: { title: string; pain: string }[];
}

type AnalyzeResult =
  | {
      success: true;
      data: CrossInsightResult;
    }
  | {
      success: false;
      error: { message: string; code: string };
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelay
  );
  return delay + Math.random() * 1000;
}

export async function analyzeCrossConversations(
  conversations: ConversationForAnalysis[],
  options: { maxRetries?: number } = {}
): Promise<AnalyzeResult> {
  const { maxRetries = RETRY_CONFIG.maxRetries } = options;

  // Need at least 2 conversations for cross-analysis
  if (conversations.length < 2) {
    return {
      success: false,
      error: {
        message: 'Need at least 2 conversations for cross-analysis',
        code: 'INSUFFICIENT_DATA',
      },
    };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: crossInsightSchema,
        system: CROSS_INSIGHT_SYSTEM_PROMPT,
        prompt: createCrossInsightPrompt(conversations),
      });

      return {
        success: true,
        data: object,
      };
    } catch (error) {
      console.error(`Cross-insight analysis attempt ${attempt + 1} failed:`, error);

      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(`Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: {
      message: 'Failed to analyze cross-conversation insights after retries',
      code: 'ANALYSIS_FAILED',
    },
  };
}
