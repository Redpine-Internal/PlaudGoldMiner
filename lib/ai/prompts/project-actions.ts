import { z } from 'zod';

// Uma tarefa gerada pela IA: título curto (acionável) + detalhe em markdown.
export const projectTaskSchema = z.object({
  title: z.string().describe('Título curto e acionável da tarefa (máx ~80 chars)'),
  detail: z.string().describe('Corpo em markdown explicando a tarefa, contexto e próximos passos'),
});

export const projectActionSchema = z.object({
  tasks: z
    .array(projectTaskSchema)
    .min(1)
    .describe('Lista de tarefas acionáveis a inserir no Backlog do projeto'),
});

export type ProjectTaskDraft = z.infer<typeof projectTaskSchema>;
export type ProjectActionResult = z.infer<typeof projectActionSchema>;

export type ProjectAction = 'aprofundar' | 'plano' | 'riscos' | 'conteudo';

export interface ProjectContext {
  title: string;
  description: string | null;
  sourceType: string | null; // 'opportunity' | 'insight' | 'content'
  // Campo extra dependente da origem (dor da oportunidade, pattern do insight, tema do conteúdo).
  extra: string | null;
}

const BASE_SYSTEM = `Você é uma assistente de produto e estratégia que ajuda Andresa a transformar ideias
em projetos executáveis. Você recebe o contexto de uma ideia (título, descrição e origem) e gera
tarefas acionáveis, específicas e realistas — nada genérico.

Regras gerais:
- Escreva em português brasileiro, claro e direto.
- Cada tarefa tem um título curto e acionável e um "detail" em markdown com contexto e próximos passos.
- Priorize o concreto sobre o abstrato. Evite tarefas vagas como "pesquisar mais".
- Gere entre 3 e 6 tarefas por ação.`;

export const ACTION_SYSTEM_PROMPTS: Record<ProjectAction, string> = {
  aprofundar: `${BASE_SYSTEM}

Ação: **Aprofundar a ideia**. Gere tarefas que investiguem e amadureçam a ideia:
perguntas-chave a responder, hipóteses a validar, público/segmento a entender,
referências e benchmarks a levantar.`,
  plano: `${BASE_SYSTEM}

Ação: **Virar projeto/plano**. Gere tarefas que estruturem a execução:
marcos, entregáveis, sequência de passos, recursos necessários e um primeiro
protótipo/MVP possível.`,
  riscos: `${BASE_SYSTEM}

Ação: **Riscos & perguntas abertas**. Gere tarefas que exponham riscos,
dependências, suposições frágeis e perguntas ainda sem resposta — cada uma com
uma ação de mitigação ou investigação.`,
  conteudo: `${BASE_SYSTEM}

Ação: **Gerar conteúdo**. Gere tarefas para produzir conteúdo a partir da ideia:
ângulos de pauta, formatos (post, artigo, vídeo), rascunhos de títulos e o
esqueleto de um primeiro conteúdo.`,
};

const ACTION_LABELS: Record<ProjectAction, string> = {
  aprofundar: 'Aprofundar a ideia',
  plano: 'Virar projeto/plano',
  riscos: 'Riscos & perguntas abertas',
  conteudo: 'Gerar conteúdo',
};

export function createProjectActionPrompt(
  action: ProjectAction,
  context: ProjectContext
): string {
  const origem =
    context.sourceType === 'opportunity'
      ? 'Oportunidade de negócio'
      : context.sourceType === 'insight'
        ? 'Insight (padrão entre conversas)'
        : context.sourceType === 'content'
          ? 'Ideia de conteúdo'
          : 'Ideia';

  return `Ação solicitada: **${ACTION_LABELS[action]}**

Contexto da ideia:
- **Origem**: ${origem}
- **Título**: ${context.title}
- **Descrição**: ${context.description || 'Não informada'}
- **Detalhe da origem**: ${context.extra || 'Não informado'}

Gere as tarefas acionáveis para esta ação, respeitando o contexto acima.`;
}
