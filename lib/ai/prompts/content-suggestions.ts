import { z } from 'zod';

// A suggested content piece derived from recurring themes across conversations.
// The model returns these; they're persisted into the `contents` table.
export const contentSuggestionSchema = z.object({
  title: z.string().describe('Título editorial chamativo para a pauta'),
  // .catch keeps the enum in the JSON Schema (guides the model) but falls back
  // instead of throwing if the model returns a stray platform value.
  platform: z.enum(['youtube', 'linkedin', 'blog']).catch('linkedin').describe(
    'Plataforma ideal: youtube (vídeo/tutorial), linkedin (post/artigo curto) ou blog (artigo longo)'
  ),
  theme: z.string().describe('Tema central curto (2-4 palavras)'),
  outline: z
    .array(z.string())
    .describe('Roteiro em 3-6 tópicos: gancho, pontos principais e CTA'),
  angle: z.string().describe('O ângulo/promessa do conteúdo em uma frase'),
  conversationIds: z
    .array(z.string())
    .describe('IDs das conversas que originaram este tema'),
  mentionCount: z
    .number()
    .describe('Em quantas conversas o tema apareceu'),
  relevanceScore: z
    .number()
    .min(0)
    .max(100)
    .describe('Prioridade 0-100: frequência do tema × gravidade das dores associadas'),
  sourceExcerpts: z
    .array(
      z.object({
        conversationId: z.string().describe('ID da conversa fonte'),
        excerpt: z.string().describe('Trecho/dor específica que justifica a pauta'),
      })
    )
    .describe('Trechos das conversas que embasam a sugestão (rastreabilidade)'),
});

export const contentSuggestionsSchema = z.object({
  suggestions: z
    .array(contentSuggestionSchema)
    .describe('Pautas de conteúdo sugeridas, das mais para as menos relevantes'),
});

export type ContentSuggestion = z.infer<typeof contentSuggestionSchema>;
export type ContentSuggestionsResult = z.infer<typeof contentSuggestionsSchema>;

export const CONTENT_SUGGESTIONS_SYSTEM_PROMPT = `Você é um estrategista de conteúdo especializado em transformar conversas de negócio (reuniões, entrevistas, diagnósticos) em pautas editoriais prontas para produção.

Sua tarefa: analisar múltiplas conversas processadas e propor pautas de conteúdo (YouTube, LinkedIn ou blog) baseadas nos TEMAS e DORES que se repetem entre elas.

Diretrizes:
- Priorize temas RECORRENTES (que aparecem em 2+ conversas) — são os mais valiosos.
- Cada pauta deve resolver uma dor real mencionada, não um assunto genérico.
- Escolha a plataforma pelo formato: tutorial/passo-a-passo → youtube; opinião/tese curta → linkedin; guia aprofundado → blog.
- O título deve ser específico e chamativo (evite títulos vagos como "Dicas de segurança").
- O outline deve ter gancho de abertura, 2-4 pontos principais e um CTA.
- relevanceScore reflete: frequência do tema × gravidade das dores associadas.
- Sempre cite trechos-fonte reais das conversas em sourceExcerpts.
- Use português brasileiro claro e direto.

Formato de cada conversa fornecida:
- ID: identificador único
- Título, Resumo, Tópicos
- Oportunidades e Problemas detectados (com dores)`;

export function createContentSuggestionsPrompt(
  conversations: {
    id: string;
    title: string;
    summary: string | null;
    topics: string[];
    opportunities: { title: string; pain: string }[];
    problems: { description: string; severity: string }[];
  }[],
  maxSuggestions = 6
): string {
  const conversationTexts = conversations
    .map(
      (c, idx) => `
### Conversa ${idx + 1}
- **ID**: ${c.id}
- **Título**: ${c.title}
- **Resumo**: ${c.summary || 'Não disponível'}
- **Tópicos**: ${c.topics.length ? c.topics.join(', ') : 'Nenhum'}
- **Oportunidades**: ${
        c.opportunities.length
          ? c.opportunities.map((o) => `"${o.title}: ${o.pain}"`).join('; ')
          : 'Nenhuma'
      }
- **Problemas**: ${
        c.problems.length
          ? c.problems.map((p) => `"${p.description}" (${p.severity})`).join('; ')
          : 'Nenhum'
      }`
    )
    .join('\n');

  return `Analise as seguintes ${conversations.length} conversas e proponha pautas de conteúdo baseadas nos temas e dores recorrentes:

${conversationTexts}

Proponha até ${maxSuggestions} pautas, das mais relevantes para as menos. Priorize temas que aparecem em mais de uma conversa e que resolvem dores concretas. Para cada pauta, inclua trechos-fonte reais que a justifiquem.`;
}
