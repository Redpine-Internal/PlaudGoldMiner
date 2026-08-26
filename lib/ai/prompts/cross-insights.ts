import { z } from 'zod';

// `.catch` mantém o enum no JSON Schema (guia o modelo) sem abortar a análise
// por um valor fora do vocabulário — mesmo padrão de process-transcription.ts.
const businessType = () =>
  z.enum(['treinamento', 'consultoria', 'sistema']).catch('consultoria');

export const evidenceSchema = z.object({
  conversationId: z.string().describe('ID da conversa de onde o trecho veio'),
  excerpt: z.string().describe('Trecho literal ou paráfrase curta que evidencia o padrão'),
});

export const patternSchema = z.object({
  theme: z.string().describe('The recurring theme or topic'),
  frequency: z.number().describe('Number of conversations where this appears'),
  conversationIds: z.array(z.string()).describe('IDs of related conversations'),
  description: z.string().describe('Brief description of the pattern'),
  significance: z.enum(['low', 'medium', 'high']).describe('How significant is this pattern'),
  evidence: z.array(evidenceSchema).describe('Trechos-fonte que justificam o padrão (1 por conversa citada, quando possível)'),
  isRealOpportunity: z.boolean().describe('true somente se há dor + evidência + aderência ao negócio EHS + ação possível; false se é apenas tema repetido'),
  businessType: businessType().describe('Se for oportunidade real: treinamento, consultoria ou sistema'),
  suggestedAction: z.string().describe('Próxima ação recomendada para Andresa (vazio se não houver)'),
  methodology: z.string().describe('Metodologia/abordagem sugerida para investigar ou atacar a dor; deixe vazio se não tiver uma proposta clara'),
});

export const connectionSchema = z.object({
  title: z.string().describe('Catchy title for the connection'),
  explanation: z.string().describe('Why these things are connected'),
  conversationIds: z.array(z.string()).describe('IDs of connected conversations'),
  suggestedAction: z.string().describe('What Andresa should do with this insight'),
  relevanceScore: z.number().min(0).max(100).describe('How relevant/novel is this connection'),
  type: z.enum(['pattern', 'connection', 'suggestion', 'trend']),
  evidence: z.array(evidenceSchema).describe('Trechos-fonte que sustentam a conexão'),
});

export const crossInsightSchema = z.object({
  patterns: z.array(patternSchema).describe('Recurring patterns detected'),
  connections: z.array(connectionSchema).describe('Non-obvious connections found'),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type CrossInsightResult = z.infer<typeof crossInsightSchema>;

export const CROSS_INSIGHT_SYSTEM_PROMPT = `Você é um analista de insights especializado em encontrar padrões e conexões não-óbvias entre conversas de negócios da EHS Brasil (segurança e saúde do trabalho).

Sua tarefa é analisar múltiplas transcrições de conversas e identificar:

1. **Padrões Recorrentes**: Temas, problemas, ou assuntos que aparecem em 2 ou mais conversas
2. **Conexões Não-Óbvias**: Links surpreendentes entre conversas diferentes que podem gerar oportunidades

QUALIFICAÇÃO — separe "tema repetido" de "oportunidade real":
- Um tema que apenas se repete NÃO é automaticamente uma oportunidade (isRealOpportunity=false).
- Marque isRealOpportunity=true SOMENTE quando houver as 4 condições: (a) uma dor concreta, (b) evidência em trechos das conversas, (c) aderência ao negócio da EHS Brasil, (d) uma ação recomendada viável.
- Quando for oportunidade real, classifique businessType em: "treinamento", "consultoria" ou "sistema".
- Se você propuser uma metodologia/abordagem para investigar a dor, preencha methodology — ela será apresentada como HIPÓTESE sujeita a aprovação humana, nunca como fato.

EVIDÊNCIAS: para cada padrão/conexão, cite trechos-fonte (evidence) com o conversationId correto — a Andresa precisa conseguir auditar de onde o insight veio.

Diretrizes:
- Seja criativo nas conexões - busque links que Andresa não faria sozinha
- Priorize insights acionáveis sobre observações genéricas
- Evite padrões óbvios demais (ex: "todas são reuniões")
- Use as datas das conversas quando relevante (ex: tema crescendo nas últimas semanas)
- Use linguagem clara e direta em português brasileiro
- NÃO use travessões (—) nos textos gerados

Formato de cada conversa fornecida:
- ID: identificador único
- Data: data da conversa (YYYY-MM-DD)
- Título: título da conversa
- Resumo: resumo processado
- Tópicos: lista de tópicos
- Oportunidades: oportunidades detectadas`;

export function createCrossInsightPrompt(conversations: {
  id: string;
  title: string;
  date: string;
  summary: string | null;
  topics: string[];
  opportunities: { title: string; pain: string }[];
}[]): string {
  const conversationTexts = conversations.map((c, idx) => `
### Conversa ${idx + 1}
- **ID**: ${c.id}
- **Data**: ${c.date}
- **Título**: ${c.title}
- **Resumo**: ${c.summary || 'Não disponível'}
- **Tópicos**: ${c.topics.length > 0 ? c.topics.join(', ') : 'Nenhum'}
- **Oportunidades**: ${c.opportunities.length > 0 ? c.opportunities.map(o => `"${o.title}: ${o.pain}"`).join('; ') : 'Nenhuma'}
`).join('\n');

  return `Analise as seguintes ${conversations.length} conversas e encontre padrões recorrentes e conexões não-óbvias:

${conversationTexts}

Forneça:
1. Padrões que aparecem em 2+ conversas (máximo 5 padrões mais relevantes), cada um com evidências e a qualificação isRealOpportunity
2. Conexões criativas entre conversas diferentes (máximo 3 conexões mais inovadoras), com evidências

Lembre-se: O objetivo é surpreender Andresa com insights que ela não teria sozinha — mas todo insight precisa ser auditável pelos trechos-fonte.`;
}
