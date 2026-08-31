import {
  ConversationCardProps,
  OpportunityCardProps,
  ContentSuggestionCardProps,
  CloneUpdateCardProps,
  ConversationDetails,
  OpportunityDetails,
  ContentDetails,
  CloneUpdateDetails
} from '@/types';

// Mock data for Conversation Cards
export const mockConversations: ConversationCardProps[] = [
  { id: 'conv-1', title: 'Alinhamento estratégico Q3', date: new Date('2025-07-15T10:00:00Z'), duration: '01:30:00', type: 'reuniao', status: 'processado', summary: 'Definição de metas e KPIs para o terceiro trimestre...' },
  { id: 'conv-2', title: 'Treinamento nova plataforma de CRM', date: new Date('2025-07-14T14:00:00Z'), duration: '02:15:00', type: 'treinamento', status: 'processado', summary: 'Apresentação das funcionalidades do novo CRM para a equipe de vendas.' },
  { id: 'conv-3', title: 'Café com startup de IA', date: new Date('2025-07-14T09:00:00Z'), duration: '00:45:00', type: 'informal', status: 'processado', summary: 'Discussão sobre possíveis parcerias e sinergias.' },
  { id: 'conv-4', title: 'Processo de Onboarding', date: new Date('2025-07-12T11:00:00Z'), duration: '01:00:00', type: 'outro', status: 'pendente', summary: 'Aguardando processamento do áudio.' },
  { id: 'conv-5', title: 'Revisão de performance H1', date: new Date('2025-07-11T16:00:00Z'), duration: '01:20:00', type: 'reuniao', status: 'erro', summary: 'Falha na transcrição do áudio.' },
];

// Mock data for Opportunity Cards
export const mockOpportunities: OpportunityCardProps[] = [
    { id: 'opp-1', title: 'Criar sistema de gestão de projetos interno', pain: 'Equipes usando planilhas e tendo dificuldade em acompanhar o progresso.', source: 'Alinhamento estratégico Q3', score: 95, type: 'sistema', status: 'nova', createdAt: new Date('2025-07-15T12:00:00Z') },
    { id: 'opp-2', title: 'Produto digital sobre gestão de tempo', pain: 'Múltiplas menções sobre sobrecarga de trabalho e falta de foco.', source: 'Revisão de performance H1', score: 80, type: 'produto', status: 'analise', createdAt: new Date('2025-07-11T18:00:00Z') },
    { id: 'opp-3', title: 'Consultoria de otimização de funil de vendas', pain: 'Equipe de vendas mencionou que o ciclo de vendas está muito longo.', source: 'Treinamento nova plataforma de CRM', score: 88, type: 'consultoria', status: 'qualificada', createdAt: new Date('2025-07-14T17:00:00Z') },
];

// Mock data for Content Suggestion Cards
export const mockContentSuggestions: ContentSuggestionCardProps[] = [
    { id: 'cont-1', title: '5 Dicas para um Planejamento Trimestral Eficaz', platform: 'artigo', theme: 'Produtividade', mentionCount: 8, relevanceScore: 90, status: 'sugerido' },
    { id: 'cont-2', title: 'Como escolher o CRM certo para sua empresa', platform: 'roteiro', subtype: 'YouTube', theme: 'Vendas', mentionCount: 5, relevanceScore: 85, status: 'producao' },
    { id: 'cont-3', title: 'O Futuro da Inteligência Artificial nos Negócios', platform: 'post', subtype: 'LinkedIn', theme: 'Tecnologia', mentionCount: 12, relevanceScore: 98, status: 'publicado' },
    { id: 'cont-4', title: '7 erros de gestão de terceiros que custam caro', platform: 'carrossel', subtype: 'Instagram', theme: 'Segurança do Trabalho', mentionCount: 6, relevanceScore: 88, status: 'sugerido' },
];

// Mock data for Clone Update Cards
export const mockCloneUpdates: CloneUpdateCardProps[] = [
    { id: 'clone-1', concept: 'Definido que a principal métrica de sucesso para o projeto X é o "engajamento de usuários ativos diários (DAU)".', sourceConversation: 'Alinhamento estratégico Q3', date: new Date('2025-07-15T11:00:00Z'), status: 'adicionado' },
    { id: 'clone-2', concept: 'O processo de qualificação de leads deve passar a incluir uma etapa de "demonstração técnica obrigatória".', sourceConversation: 'Treinamento nova plataforma de CRM', date: new Date('2025-07-14T16:00:00Z'), status: 'adicionado' },
    { id: 'clone-3', concept: 'A empresa Y é uma potencial parceira estratégica.', sourceConversation: 'Café com startup de IA', date: new Date('2025-07-14T10:00:00Z'), status: 'rejeitado', reason: 'Duplicado' },
];


// --- DETAILED MOCKS ---

export const mockConversationDetails: Record<string, ConversationDetails> = {
  'conv-1': { 
    ...mockConversations[0],
    transcription: "Lorem ipsum dolor sit amet, consectetur adipiscing elit...",
    insights: {
      objectives: ["Definir metas para o Q3", "Alinhar KPIs entre os times"],
      participants: ["Andresa", "Carlos (Vendas)", "Mariana (Marketing)"],
      mainPoints: ["Aumento de 20% na geração de leads", "Lançamento da campanha 'Verão Digital' em Agosto"],
      decisions: ["Foco total no mercado B2B para o próximo trimestre"],
      todos: ["Mariana: apresentar plano de mídia até 20/07", "Carlos: treinar equipe no novo script de vendas"],
      nextSteps: ["Reunião de acompanhamento em 15/08"]
    }
  },
  // Add other detailed conversations as needed
};

export const mockOpportunityDetails: Record<string, OpportunityDetails> = {
    'opp-1': {
        ...mockOpportunities[0],
        context: 'Durante a reunião de alinhamento, foi mencionado repetidamente que os gerentes de projeto não têm visibilidade clara sobre o andamento das tarefas, resultando em atrasos.',
        impactAnalysis: 'Alto. A falta de um sistema centralizado está custando horas de produtividade e gerando retrabalho.',
        urgency: 'Alta',
        proposedSolution: 'Desenvolver um painel de projetos simples, com status, responsáveis e prazos, integrado com as ferramentas de comunicação atuais.',
        viability: 'Média. Requer alocação de um time de desenvolvimento por 3 meses.',
        suggestedNextStep: 'Realizar workshop com os gerentes de projeto para levantar requisitos detalhados.',
    }
};

export const mockContentDetails: Record<string, ContentDetails> = {
    'cont-1': {
        ...mockContentSuggestions[0],
        keyPoints: [
            "A importância de revisar o trimestre anterior.",
            "Como definir metas SMART.",
            "Técnicas de priorização de iniciativas.",
            "Ferramentas para acompanhar o progresso."
        ],
        evidenceSnippets: [
            '"...nós sempre nos perdemos no meio do trimestre porque o plano não era claro..."',
            '"...se tivéssemos metas mensuráveis, seria mais fácil corrigir a rota..."'
        ],
        targetAudience: 'Gestores e líderes de equipe.',
    }
};

export const mockCloneUpdateDetails: Record<string, CloneUpdateDetails> = {
    'clone-1': {
        ...mockCloneUpdates[0],
        fullConcept: 'A principal métrica de sucesso para o projeto de expansão internacional (codinome "Projeto X") foi definida como o "engajamento de usuários ativos diários (DAU)", com o objetivo de atingir 10.000 DAUs até o final do Q3.',
        sourceSnippet: '"Ok, então está decidido, vamos focar em DAU como nossa estrela guia para o X."',
        agentJustification: 'Esta é uma decisão estratégica de alta importância que define o critério de sucesso para um projeto prioritário.',
    }
};
