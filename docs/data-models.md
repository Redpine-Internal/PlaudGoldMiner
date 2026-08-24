# Andresa AI - Modelos de Dados

## Visão Geral

O projeto utiliza TypeScript interfaces para definir a estrutura de dados. Todas as definições estão centralizadas em `types/index.ts`.

**Nota:** Não há banco de dados implementado. Os dados são mockados em `lib/mock-data.ts`.

---

## Entidades de Card (Listagem)

### ConversationCardProps
Representa uma conversa na listagem.

```typescript
interface ConversationCardProps {
  id: string;
  title: string;
  date: Date;
  duration: string;           // Formato: "HH:MM:SS"
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro';
  status: 'processado' | 'pendente' | 'erro';
  summary?: string;
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | Identificador único |
| title | string | Sim | Título da conversa |
| date | Date | Sim | Data/hora da conversa |
| duration | string | Sim | Duração no formato HH:MM:SS |
| type | enum | Sim | Tipo da conversa |
| status | enum | Sim | Status de processamento |
| summary | string | Não | Resumo curto |

---

### OpportunityCardProps
Representa uma oportunidade de negócio na listagem.

```typescript
interface OpportunityCardProps {
  id: string;
  title: string;
  pain: string;               // Dor/problema identificado
  source: string;             // Conversa de origem
  score: number;              // 0-100
  type: 'produto' | 'sistema' | 'consultoria' | 'servico';
  status: 'nova' | 'analise' | 'qualificada' | 'descartada';
  createdAt: Date;
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | Identificador único |
| title | string | Sim | Título da oportunidade |
| pain | string | Sim | Dor/problema identificado |
| source | string | Sim | Nome da conversa de origem |
| score | number | Sim | Score de relevância (0-100) |
| type | enum | Sim | Tipo de oportunidade |
| status | enum | Sim | Status de qualificação |
| createdAt | Date | Sim | Data de criação |

---

### ContentSuggestionCardProps
Representa uma sugestão de conteúdo na listagem.

```typescript
interface ContentSuggestionCardProps {
  id: string;
  title: string;
  platform: 'youtube' | 'linkedin' | 'blog';
  theme: string;
  mentionCount: number;       // Quantas vezes o tema foi mencionado
  relevanceScore: number;     // 0-100
  status: 'sugerido' | 'producao' | 'publicado' | 'descartado';
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | Identificador único |
| title | string | Sim | Título sugerido |
| platform | enum | Sim | Plataforma de publicação |
| theme | string | Sim | Tema/categoria |
| mentionCount | number | Sim | Contagem de menções |
| relevanceScore | number | Sim | Score de relevância |
| status | enum | Sim | Status de produção |

---

### CloneUpdateCardProps
Representa uma atualização da base de conhecimento (Clone).

```typescript
interface CloneUpdateCardProps {
  id: string;
  concept: string;            // Conceito extraído
  sourceConversation: string; // Conversa de origem
  date: Date;
  status: 'adicionado' | 'rejeitado';
  reason?: string;            // Motivo da rejeição
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | Identificador único |
| concept | string | Sim | Conceito/conhecimento extraído |
| sourceConversation | string | Sim | Nome da conversa de origem |
| date | Date | Sim | Data da atualização |
| status | enum | Sim | Se foi adicionado ou rejeitado |
| reason | string | Não | Motivo da rejeição |

---

## Entidades de Detalhe (Visualização Expandida)

### ConversationDetails
Estende `ConversationCardProps` com dados completos.

```typescript
interface ConversationDetails extends ConversationCardProps {
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
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| transcription | string | Transcrição completa |
| insights.objectives | string[] | Objetivos identificados |
| insights.participants | string[] | Participantes |
| insights.mainPoints | string[] | Pontos principais |
| insights.decisions | string[] | Decisões tomadas |
| insights.todos | string[] | Tarefas/ações |
| insights.nextSteps | string[] | Próximos passos |

---

### OpportunityDetails
Estende `OpportunityCardProps` com análise detalhada.

```typescript
interface OpportunityDetails extends OpportunityCardProps {
  context: string;
  impactAnalysis: string;
  urgency: string;
  proposedSolution: string;
  viability: string;
  suggestedNextStep: string;
  notes?: string;
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| context | string | Contexto completo |
| impactAnalysis | string | Análise de impacto |
| urgency | string | Nível de urgência |
| proposedSolution | string | Solução proposta |
| viability | string | Análise de viabilidade |
| suggestedNextStep | string | Próximo passo sugerido |
| notes | string | Notas adicionais |

---

### ContentDetails
Estende `ContentSuggestionCardProps` com detalhes para produção.

```typescript
interface ContentDetails extends ContentSuggestionCardProps {
  keyPoints: string[];
  evidenceSnippets: string[];
  targetAudience: string;
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| keyPoints | string[] | Pontos-chave a abordar |
| evidenceSnippets | string[] | Trechos de evidência |
| targetAudience | string | Público-alvo |

---

### CloneUpdateDetails
Estende `CloneUpdateCardProps` com justificativas.

```typescript
interface CloneUpdateDetails extends CloneUpdateCardProps {
  fullConcept: string;
  sourceSnippet: string;
  comparisonWithSimilar?: string;
  agentJustification: string;
  conceptualDiff?: string;
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| fullConcept | string | Conceito completo |
| sourceSnippet | string | Trecho da conversa original |
| comparisonWithSimilar | string | Comparação com conceitos similares |
| agentJustification | string | Justificativa do agente |
| conceptualDiff | string | Diferencial conceitual |

---

## Enums

### Tipos de Conversa
```typescript
type ConversationType = 'reuniao' | 'treinamento' | 'informal' | 'outro';
```

### Status de Processamento
```typescript
type ProcessingStatus = 'processado' | 'pendente' | 'erro';
```

### Tipos de Oportunidade
```typescript
type OpportunityType = 'produto' | 'sistema' | 'consultoria' | 'servico';
```

### Status de Oportunidade
```typescript
type OpportunityStatus = 'nova' | 'analise' | 'qualificada' | 'descartada';
```

### Plataformas de Conteúdo
```typescript
type Platform = 'youtube' | 'linkedin' | 'blog';
```

### Status de Conteúdo
```typescript
type ContentStatus = 'sugerido' | 'producao' | 'publicado' | 'descartado';
```

### Status de Clone
```typescript
type CloneStatus = 'adicionado' | 'rejeitado';
```

---

## Relacionamentos

```
Conversation
├── gera → Opportunity (1:N)
├── gera → ContentSuggestion (1:N)
└── gera → CloneUpdate (1:N)

Opportunity
└── origin ← Conversation (N:1)

ContentSuggestion
└── evidências ← Conversation (N:N)

CloneUpdate
└── origin ← Conversation (N:1)
```

---

## Dados Mockados

### Quantidades
| Entidade | Quantidade Mock |
|----------|-----------------|
| Conversations | 5 |
| ConversationDetails | 1 |
| Opportunities | 3 |
| OpportunityDetails | 1 |
| ContentSuggestions | 3 |
| ContentDetails | 1 |
| CloneUpdates | 3 |
| CloneUpdateDetails | 1 |

### Arquivo
`lib/mock-data.ts` exporta:
- `mockConversations`
- `mockConversationDetails`
- `mockOpportunities`
- `mockOpportunityDetails`
- `mockContentSuggestions`
- `mockContentDetails`
- `mockCloneUpdates`
- `mockCloneUpdateDetails`
