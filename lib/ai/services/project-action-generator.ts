import { generateObject } from 'ai';
import { anthropic, DEFAULT_MODEL, RETRY_CONFIG } from '../client';
import {
  projectActionSchema,
  ProjectActionResult,
  ProjectAction,
  ProjectContext,
  ACTION_SYSTEM_PROMPTS,
  createProjectActionPrompt,
} from '../prompts/project-actions';

type GenerateResult =
  | {
      success: true;
      data: ProjectActionResult;
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

export async function generateProjectTasks(
  action: ProjectAction,
  context: ProjectContext,
  options: { maxRetries?: number } = {}
): Promise<GenerateResult> {
  const { maxRetries = RETRY_CONFIG.maxRetries } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: projectActionSchema,
        system: ACTION_SYSTEM_PROMPTS[action],
        prompt: createProjectActionPrompt(action, context),
      });

      return {
        success: true,
        data: object,
      };
    } catch (error) {
      console.error(`Project action "${action}" attempt ${attempt + 1} failed:`, error);

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
      message: 'Failed to generate project tasks after retries',
      code: 'GENERATION_FAILED',
    },
  };
}
