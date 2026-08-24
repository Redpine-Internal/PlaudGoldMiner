// Feature-flag seletor de origem por capacidade (Fase A — não-destrutivo).
//
// Cada rota de IA pergunta `resolveSource(cap)` para saber se processa `local`
// (Azure OpenAI + SQLite, comportamento atual) ou dispara o agente `n8n`.
// Default = `local`. Rollback de qualquer fase = trocar a flag no .env, sem deploy.

export type AiCapability = 'meeting' | 'opportunities' | 'social';
export type AiSource = 'local' | 'n8n';

const ENV_BY_CAP: Record<AiCapability, string> = {
  meeting: 'AI_SOURCE_MEETING',
  opportunities: 'AI_SOURCE_OPPORTUNITIES',
  social: 'AI_SOURCE_SOCIAL',
};

/**
 * Decide, em runtime, a origem de processamento de uma capacidade.
 * Qualquer valor diferente de `n8n` (incl. ausente/typo) cai em `local` — fail-safe.
 */
export function resolveSource(cap: AiCapability): AiSource {
  const raw = process.env[ENV_BY_CAP[cap]]?.trim().toLowerCase();
  return raw === 'n8n' ? 'n8n' : 'local';
}
