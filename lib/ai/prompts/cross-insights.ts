import { z } from 'zod';

export const patternSchema = z.object({
  theme: z.string().describe('The recurring theme or topic'),
  frequency: z.number().describe('Number of conversations where this appears'),
  conversationIds: z.array(z.string()).describe('IDs of related conversations'),
  description: z.string().describe('Brief description of the pattern'),
  significance: z.enum(['low', 'medium', 'high']).describe('How significant is this pattern'),
});

export const connectionSchema = z.object({
  title: z.string().describe('Catchy title for the connection'),
  explanation: z.string().describe('Why these things are connected'),
  conversationIds: z.array(z.string()).describe('IDs of connected conversations'),
  suggestedAction: z.string().describe('What Andresa should do with this insight'),
  relevanceScore: z.number().min(0).max(100).describe('How relevant/novel is this connection'),
  type: z.enum(['pattern', 'connection', 'suggestion', 'trend']),
});

export const crossInsightSchema = z.object({
  patterns: z.array(patternSchema).describe('Recurring patterns detected'),
  connections: z.array(connectionSchema).describe('Non-obvious connections found'),
});

export type Pattern = z.infer<typeof patternSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type CrossInsightResult = z.infer<typeof crossInsightSchema>;

export const CROSS_INSIGHT_SYSTEM_PROMPT = `Você é um analista de insights especializado em encontrar padrões e conexões não-óbvias entre conversas de negócios.

Sua tarefa é analisar múltiplas transcrições de conversas e identificar:

1. **Padrões Recorrentes**: Temas, problemas, ou assuntos que aparecem em 2 ou mais conversas
2. **Conexões Não-Óbvias**: Links surpreendentes entre conversas diferentes que podem gerar oportunidades

Diretrizes:
- Seja criativo nas conexões - busque links que Andresa não faria sozinha
- Priorize insights acionáveis sobre observações genéricas
- Evite padrões óbvios demais (ex: "todas são reuniões")
- Para cada conexão, explique claramente o "porquê" e sugira uma ação
- Use linguagem clara e direta em português brasileiro

Formato de cada conversa fornecida:
- ID: identificador único
- Título: título da conversa
- Resumo: resumo processado
- Tópicos: lista de tópicos
- Oportunidades: oportunidades detectadas`;

export function createCrossInsightPrompt(conversations: {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  opportunities: { title: string; pain: string }[];
}[]): string {
  const conversationTexts = conversations.map((c, idx) => `
### Conversa ${idx + 1}
- **ID**: ${c.id}
- **Título**: ${c.title}
- **Resumo**: ${c.summary || 'Não disponível'}
- **Tópicos**: ${c.topics.length > 0 ? c.topics.join(', ') : 'Nenhum'}
- **Oportunidades**: ${c.opportunities.length > 0 ? c.opportunities.map(o => `"${o.title}: ${o.pain}"`).join('; ') : 'Nenhuma'}
`).join('\n');

  return `Analise as seguintes ${conversations.length} conversas e encontre padrões recorrentes e conexões não-óbvias:

${conversationTexts}

Forneça:
1. Padrões que aparecem em 2+ conversas (máximo 5 padrões mais relevantes)
2. Conexões criativas entre conversas diferentes (máximo 3 conexões mais inovadoras)

Lembre-se: O objetivo é surpreender Andresa com insights que ela não teria sozinha!`;
}
