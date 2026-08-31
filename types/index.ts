// Type definitions based on the project prompt

// Card component props
export interface ConversationCardProps {
  id: string;
  title: string;
  date: Date;
  duration: string;
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  status: 'processado' | 'pendente' | 'erro';
  summary?: string;
}

export interface OpportunityCardProps {
  id: string;
  title: string;
  pain: string;
  source: string;
  score: number; // 0-100
  type: 'produto' | 'sistema' | 'consultoria' | 'servico';
  status: 'nova' | 'analise' | 'qualificada' | 'descartada';
  createdAt: Date;
}

export interface ContentSuggestionCardProps {
  id: string;
  title: string;
  /** Formato do conteúdo (taxonomia 2026-08-28). */
  platform: 'artigo' | 'post' | 'carrossel' | 'roteiro';
  /** Variação livre dentro do formato (ex.: "LinkedIn", "YouTube"). */
  subtype?: string | null;
  theme: string;
  mentionCount: number;
  relevanceScore: number;
  status: 'sugerido' | 'producao' | 'publicado' | 'descartado';
}

export interface CloneUpdateCardProps {
  id: string;
  concept: string;
  sourceConversation: string;
  date: Date;
  status: 'adicionado' | 'rejeitado';
  reason?: string;
}

// API Endpoint Payloads
// These can be expanded based on the detailed panel views in the prompt

// GET /api/conversas/:id
export interface ConversationDetails extends ConversationCardProps {
  transcription: string;
  insights: {
    objectives: string[];
    participants: string[];
    mainPoints: string[];
    decisions: string[];
    todos: string[];
    nextSteps: string[];
  };
}

// GET /api/oportunidades/:id
export interface OpportunityDetails extends OpportunityCardProps {
  context: string;
  impactAnalysis: string;
  urgency: string;
  proposedSolution: string;
  viability: string;
  suggestedNextStep: string;
  notes?: string;
}

// GET /api/conteudos/:id
export interface ContentDetails extends ContentSuggestionCardProps {
  keyPoints: string[];
  evidenceSnippets: string[];
  targetAudience: string;
}

// GET /api/clone/updates/:id
export interface CloneUpdateDetails extends CloneUpdateCardProps {
  fullConcept: string;
  sourceSnippet: string;
  comparisonWithSimilar?: string;
  agentJustification: string;
  conceptualDiff?: string;
}
