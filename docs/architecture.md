# Andresa AI - Architecture Decision Document

> Documento de decisões arquiteturais para consistência entre agentes AI durante implementação.

---

## Executive Summary

**Projeto:** Andresa AI - Plataforma de gestão de conversas e insights
**Tipo:** Brownfield - Extensão de frontend existente com backend completo
**Foco:** Processamento de transcrições com AI para extração de oportunidades e sugestões de conteúdo

### Stack Resumida
- **Frontend:** Next.js 16, React 19, TypeScript 5, Tailwind v4, shadcn/ui, Zustand
- **Backend:** Next.js API Routes + Server Actions
- **Database:** Drizzle ORM + Turso (SQLite edge)
- **AI:** Vercel AI SDK + Claude (Anthropic)
- **Auth:** NextAuth.js v5 (Google OAuth para Drive)

---

## Decision Summary Table

| Categoria | Decisão | Justificativa |
|-----------|---------|---------------|
| Database ORM | Drizzle ORM | Type-safe, leve, serverless-friendly |
| Database Provider | Turso (SQLite edge) | Free tier generoso, edge-native, simples |
| AI Provider | Vercel AI SDK + Claude | Melhor para textos longos, streaming nativo |
| Auth | NextAuth.js v5 | Google OAuth para Drive, sem user auth |
| Validation | Zod | Padrão com shadcn/ui, runtime + types |
| Data Fetching | TanStack Query v5 | Cache, mutations, optimistic updates |
| File Upload | react-dropzone | Drag-and-drop, validação, leve |
| Background Jobs | Inline processing | MVP simplicidade, escalar depois |
| Hosting | Vercel + Turso | Zero-config, edge-native |
| State Management | Zustand (existente) | Já configurado, funciona bem |
| Styling | Tailwind v4 + shadcn/ui | Já configurado, design system pronto |

---

## Project Structure

```
ehs-insights/
├── app/
│   ├── layout.tsx                    # Root layout (existente)
│   ├── page.tsx                      # Dashboard (existente)
│   ├── conversas/
│   │   └── page.tsx                  # Lista conversas (existente)
│   ├── oportunidades/
│   │   └── page.tsx                  # Lista oportunidades (placeholder → implementar)
│   ├── conteudos/
│   │   └── page.tsx                  # Sugestões conteúdo (placeholder → implementar)
│   ├── clone/
│   │   └── page.tsx                  # Updates do clone (placeholder → implementar)
│   ├── configuracoes/
│   │   └── page.tsx                  # Configurações (placeholder → implementar)
│   │
│   └── api/                          # ← NOVO: API Routes
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts          # NextAuth.js handler
│       ├── conversations/
│       │   ├── route.ts              # GET (list), POST (create)
│       │   ├── [id]/
│       │   │   └── route.ts          # GET, PATCH, DELETE
│       │   └── upload/
│       │       └── route.ts          # POST multipart upload
│       ├── opportunities/
│       │   ├── route.ts              # GET (list)
│       │   └── [id]/
│       │       └── route.ts          # GET, PATCH
│       ├── contents/
│       │   ├── route.ts              # GET (list)
│       │   └── [id]/
│       │       └── route.ts          # GET, PATCH
│       ├── clone/
│       │   └── route.ts              # GET updates
│       ├── process/
│       │   └── route.ts              # POST trigger AI processing
│       └── drive/
│           ├── auth/
│           │   └── route.ts          # OAuth callback
│           └── import/
│               └── route.ts          # POST import from Drive
│
├── components/
│   ├── ui/                           # shadcn/ui (existente)
│   ├── layout/
│   │   ├── Sidebar.tsx               # (existente)
│   │   ├── AppShell.tsx              # (existente)
│   │   └── OutputPanel.tsx           # (existente)
│   ├── conversations/
│   │   ├── ConversationCard.tsx      # (existente)
│   │   ├── ConversationList.tsx      # (existente)
│   │   └── ConversationDetail.tsx    # ← NOVO ou adaptar OutputPanel
│   ├── opportunities/                # ← NOVO
│   │   ├── OpportunityCard.tsx
│   │   ├── OpportunityList.tsx
│   │   └── OpportunityDetail.tsx
│   ├── contents/                     # ← NOVO
│   │   ├── ContentCard.tsx
│   │   ├── ContentList.tsx
│   │   └── ContentDetail.tsx
│   ├── upload/                       # ← NOVO
│   │   ├── DropZone.tsx
│   │   ├── FileList.tsx
│   │   └── UploadProgress.tsx
│   └── shared/                       # ← NOVO
│       ├── ProcessingStatus.tsx
│       ├── ConfidenceBadge.tsx
│       └── EmptyState.tsx
│
├── lib/
│   ├── mock-data.ts                  # (existente - remover quando DB pronto)
│   ├── utils.ts                      # (existente)
│   ├── db/                           # ← NOVO
│   │   ├── index.ts                  # Drizzle client
│   │   ├── schema.ts                 # Drizzle schema
│   │   └── migrations/               # SQL migrations
│   ├── ai/                           # ← NOVO
│   │   ├── client.ts                 # Vercel AI SDK setup
│   │   ├── prompts/
│   │   │   ├── extract-opportunities.ts
│   │   │   ├── suggest-contents.ts
│   │   │   └── generate-summary.ts
│   │   └── processors/
│   │       └── conversation-processor.ts
│   ├── auth/                         # ← NOVO
│   │   └── config.ts                 # NextAuth.js config
│   ├── drive/                        # ← NOVO
│   │   └── client.ts                 # Google Drive API
│   └── validators/                   # ← NOVO
│       ├── conversation.ts           # Zod schemas
│       ├── opportunity.ts
│       └── content.ts
│
├── stores/
│   └── appStore.ts                   # Zustand (existente)
│
├── hooks/                            # ← NOVO
│   ├── useConversations.ts           # TanStack Query hooks
│   ├── useOpportunities.ts
│   ├── useContents.ts
│   └── useUpload.ts
│
├── types/
│   └── index.ts                      # (existente - expandir)
│
├── drizzle.config.ts                 # ← NOVO: Drizzle config
└── .env.local                        # ← NOVO: Environment vars
```

---

## Epic to Architecture Mapping

### Epic 1: Foundation & Backend Core
**Stories:** E1-S1, E1-S2, E1-S3
**Arquivos:**
- `lib/db/schema.ts` - Drizzle schema
- `lib/db/index.ts` - Client setup
- `drizzle.config.ts` - Config
- `app/api/conversations/route.ts` - CRUD

### Epic 2: Ingestão de Transcrições
**Stories:** E2-S1, E2-S2, E2-S3, E2-S4, E2-S5
**Arquivos:**
- `components/upload/*` - Upload UI
- `app/api/conversations/upload/route.ts` - Upload handler
- `lib/auth/config.ts` - NextAuth config
- `app/api/drive/*` - Drive integration
- `lib/drive/client.ts` - Drive API

### Epic 3: Visualização de Conversas
**Stories:** E3-S1, E3-S2, E3-S3, E3-S4
**Arquivos:**
- `components/conversations/*` - UI components
- `hooks/useConversations.ts` - Data hooks
- Adaptar `OutputPanel` existente

### Epic 4: Gestão de Oportunidades
**Stories:** E4-S1, E4-S2, E4-S3, E4-S4
**Arquivos:**
- `lib/ai/prompts/extract-opportunities.ts`
- `lib/ai/processors/conversation-processor.ts`
- `components/opportunities/*`
- `app/oportunidades/page.tsx`

### Epic 5: Cross-Conversation Intelligence
**Stories:** E5-S1, E5-S2, E5-S3, E5-S4
**Arquivos:**
- `lib/ai/prompts/suggest-contents.ts`
- `app/api/process/route.ts` - Batch processing
- `components/shared/ConfidenceBadge.tsx`

### Epic 6: Conteúdos & Exportação
**Stories:** E6-S1, E6-S2, E6-S3
**Arquivos:**
- `components/contents/*`
- `app/conteudos/page.tsx`
- `app/api/contents/[id]/export/route.ts`

---

## Database Schema (Drizzle)

```typescript
// lib/db/schema.ts
import { sqliteTable, text, integer, real, sql } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  duration: text('duration'),
  type: text('type', { enum: ['reuniao', 'treinamento', 'informal', 'outro'] }).notNull(),
  status: text('status', { enum: ['pendente', 'processando', 'processado', 'erro'] }).notNull().default('pendente'),
  transcription: text('transcription'),
  summary: text('summary'),
  topics: text('topics'),                    // JSON array of topics extracted by AI
  participants: text('participants'),        // JSON array of participant names (FR-2.3)
  tags: text('tags'),                        // JSON array of user-defined tags (FR-1.5)
  source: text('source', { enum: ['plaud', 'drive', 'upload'] }).notNull(),
  sourceFileId: text('source_file_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  title: text('title').notNull(),
  pain: text('pain').notNull(),
  context: text('context'),
  score: real('score').notNull(),            // 0-100 confidence score
  type: text('type', { enum: ['produto', 'sistema', 'consultoria', 'servico'] }).notNull(),
  status: text('status', { enum: ['nova', 'analise', 'qualificada', 'descartada'] }).notNull().default('nova'),
  notes: text('notes'),                      // User personal notes (FR-4.4)
  tags: text('tags'),                        // JSON array of tags
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const contents = sqliteTable('contents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  platform: text('platform', { enum: ['youtube', 'linkedin', 'blog'] }).notNull(),
  theme: text('theme').notNull(),
  outline: text('outline'),                  // JSON structured outline
  mentionCount: integer('mention_count').notNull().default(1),
  relevanceScore: real('relevance_score').notNull(),
  status: text('status', { enum: ['sugerido', 'producao', 'publicado', 'descartado'] }).notNull().default('sugerido'),
  notes: text('notes'),                      // User notes
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),
  contentId: text('content_id').references(() => contents.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  excerpt: text('excerpt'),
});

// NOVO: Cross-Conversation Insights (FR-7.x - Diferencial do produto)
export const crossInsights = sqliteTable('cross_insights', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  pattern: text('pattern').notNull(),        // Description of detected pattern
  conversationIds: text('conversation_ids'), // JSON array of related conversation IDs
  insightType: text('insight_type', {
    enum: ['pattern', 'connection', 'suggestion', 'trend']
  }).notNull(),
  confidence: real('confidence').notNull(),  // 0-1 confidence score
  status: text('status', {
    enum: ['new', 'useful', 'ignored', 'implemented']
  }).notNull().default('new'),
  actionSuggestion: text('action_suggestion'), // Suggested action based on insight
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// Relation table for cross_insights ↔ conversations (many-to-many)
export const crossInsightConversations = sqliteTable('cross_insight_conversations', {
  id: text('id').primaryKey(),
  crossInsightId: text('cross_insight_id').references(() => crossInsights.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  relevance: text('relevance'),              // Why this conversation is relevant
});
```

### Schema Notes

- **JSON columns**: `topics`, `participants`, `tags`, `conversationIds` são armazenados como JSON strings. Usar `JSON.parse()` ao ler e `JSON.stringify()` ao escrever.
- **Timestamps**: Usando `strftime('%s', 'now')` para compatibilidade com Turso/SQLite.
- **Tags**: Implementadas como JSON array por simplicidade no MVP. Pode evoluir para tabela dedicada se necessário.

---

## Implementation Patterns

### API Route Pattern
```typescript
// app/api/conversations/route.ts
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { conversationListSchema } from '@/lib/validators/conversation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = conversationListSchema.parse(Object.fromEntries(searchParams));

  const result = await db.select().from(conversations)
    .where(params.status ? eq(conversations.status, params.status) : undefined)
    .orderBy(desc(conversations.date))
    .limit(params.limit ?? 50);

  return Response.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const validated = conversationCreateSchema.parse(body);

  const [created] = await db.insert(conversations).values({
    id: crypto.randomUUID(),
    ...validated,
  }).returning();

  return Response.json(created, { status: 201 });
}
```

### TanStack Query Hook Pattern
```typescript
// hooks/useConversations.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useConversations(filters?: ConversationFilters) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: () => fetch('/api/conversations?' + new URLSearchParams(filters)).then(r => r.json()),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConversationCreate) =>
      fetch('/api/conversations', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
```

### AI Processing Pattern
```typescript
// lib/ai/processors/conversation-processor.ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { opportunitySchema } from '@/lib/validators/opportunity';

export async function extractOpportunities(transcription: string) {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: opportunitySchema,
    prompt: `Analise esta transcrição e extraia oportunidades de negócio...

    ${transcription}`,
  });

  return object;
}
```

### Zod Validation Pattern
```typescript
// lib/validators/conversation.ts
import { z } from 'zod';

export const conversationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.coerce.date(),
  duration: z.string().optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']),
  transcription: z.string().optional(),
  source: z.enum(['plaud', 'drive', 'upload']),
  sourceFileId: z.string().optional(),
});

export const conversationListSchema = z.object({
  status: z.enum(['pendente', 'processando', 'processado', 'erro']).optional(),
  type: z.enum(['reuniao', 'treinamento', 'informal', 'outro']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

export type ConversationCreate = z.infer<typeof conversationCreateSchema>;
```

---

## Consistency Rules for AI Agents

### File Organization
1. **API Routes**: Sempre em `app/api/[resource]/route.ts`
2. **Components**: Em `components/[domain]/[Component].tsx`
3. **Hooks**: Em `hooks/use[Resource].ts`
4. **Validators**: Em `lib/validators/[resource].ts`
5. **AI Prompts**: Em `lib/ai/prompts/[action].ts`

### Naming Conventions
- **Files**: kebab-case (`conversation-card.tsx`)
- **Components**: PascalCase (`ConversationCard`)
- **Functions**: camelCase (`extractOpportunities`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Types**: PascalCase (`Conversation`, `OpportunityCreate`)

### Import Order
```typescript
// 1. React/Next.js
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 2. External libraries
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Internal - lib
import { db } from '@/lib/db';

// 4. Internal - components
import { Button } from '@/components/ui/button';

// 5. Internal - types
import type { Conversation } from '@/types';
```

### Error Handling
```typescript
// API Routes - sempre retornar Response com status apropriado
try {
  const result = await db.select()...;
  return Response.json(result);
} catch (error) {
  console.error('[API] Error:', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

// Client - usar try/catch com toast
try {
  await createConversation.mutateAsync(data);
  toast.success('Conversa criada!');
} catch (error) {
  toast.error('Erro ao criar conversa');
}
```

---

## Environment Variables

```bash
# .env.local

# Database (Turso)
TURSO_DATABASE_URL=libsql://[database]-[org].turso.io
TURSO_AUTH_TOKEN=eyJ...

# AI (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Auth (Google OAuth)
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# NextAuth
NEXTAUTH_SECRET=random-32-char-string
NEXTAUTH_URL=http://localhost:3000
```

---

## API Contracts

### Conversations
```
GET    /api/conversations           → Conversation[]
GET    /api/conversations/:id       → Conversation
POST   /api/conversations           → Conversation (create)
PATCH  /api/conversations/:id       → Conversation (update)
DELETE /api/conversations/:id       → void
POST   /api/conversations/upload    → Conversation (multipart)
```

### Opportunities
```
GET    /api/opportunities           → Opportunity[]
GET    /api/opportunities/:id       → Opportunity
PATCH  /api/opportunities/:id       → Opportunity (update status)
```

### Contents
```
GET    /api/contents                → Content[]
GET    /api/contents/:id            → Content
PATCH  /api/contents/:id            → Content (update status)
```

### Processing
```
POST   /api/process                 → { jobId, status } (trigger AI)
```

### Drive Integration
```
GET    /api/drive/auth              → Redirect to OAuth
POST   /api/drive/import            → Conversation[] (import files)
```

---

## Architectural Decision Records (ADRs)

### ADR-001: Drizzle ORM + Turso
**Status:** Accepted
**Context:** Precisamos de um ORM type-safe que funcione bem em serverless/edge
**Decision:** Drizzle ORM com Turso (SQLite edge)
**Consequences:**
- (+) Type-safe, queries SQL reais, leve
- (+) Turso tem free tier generoso e é edge-native
- (-) SQLite tem limitações para queries complexas
- Mitigação: MVP não precisa de queries complexas

### ADR-002: Vercel AI SDK + Claude
**Status:** Accepted
**Context:** Precisamos processar transcrições longas (até 30 min) e extrair insights
**Decision:** Vercel AI SDK com Claude (Anthropic)
**Consequences:**
- (+) Claude é superior para textos longos e análise
- (+) Vercel AI SDK tem streaming nativo e structured output
- (+) Integração perfeita com Next.js
- (-) Custo por token (mas MVP tem volume baixo)

### ADR-003: TanStack Query para Data Fetching
**Status:** Accepted
**Context:** Precisamos de cache, mutations e loading states consistentes
**Decision:** TanStack Query v5
**Consequences:**
- (+) Cache automático, invalidation, optimistic updates
- (+) Hooks padronizados para toda equipe
- (+) DevTools para debug
- (-) Mais uma dependência (mas vale a pena)

### ADR-004: NextAuth.js v5 para Google OAuth
**Status:** Accepted
**Context:** Precisamos de OAuth com Google Drive, mas não de auth de usuário
**Decision:** NextAuth.js v5 apenas para obter tokens do Drive
**Consequences:**
- (+) Gerencia refresh tokens automaticamente
- (+) Padrão da indústria para Next.js
- (+) Pode evoluir para user auth se necessário
- (-) "Overkill" para só Drive, mas simplifica futuro

### ADR-005: Inline Processing (MVP)
**Status:** Accepted
**Context:** Processamento AI pode demorar 30-60s
**Decision:** Processar inline com streaming para MVP
**Consequences:**
- (+) Simples, sem infra adicional
- (+) Usuário vê progresso em tempo real
- (-) Timeout pode ser problema em transcrições muito longas
- Mitigação: Limitar tamanho inicial, evoluir para queue depois

### ADR-006: Chunking para Transcrições Longas
**Status:** Accepted
**Context:** NFR-1.1 exige < 120s para 1h de conversa, mas Vercel tem timeout de 60s (Hobby) ou 300s (Pro)
**Decision:** Implementar chunking de transcrições + streaming de progresso
**Implementation:**
```typescript
// Chunking strategy for long transcriptions
const MAX_CHUNK_SIZE = 15000; // ~15k tokens, safe for Claude

async function processLongTranscription(text: string) {
  if (text.length <= MAX_CHUNK_SIZE) {
    return processSingleChunk(text);
  }

  // Split into chunks with overlap for context
  const chunks = splitWithOverlap(text, MAX_CHUNK_SIZE, 500);
  const results = [];

  for (const chunk of chunks) {
    const result = await processSingleChunk(chunk);
    results.push(result);
    // Stream progress to client
    yield { progress: results.length / chunks.length, partial: result };
  }

  // Merge results
  return mergeChunkResults(results);
}
```
**Consequences:**
- (+) Suporta transcrições de qualquer tamanho
- (+) Progresso granular para UX
- (-) Merge de resultados pode perder contexto cross-chunk
- Mitigação: Overlap de 500 chars entre chunks

---

## API Contracts (Updated)

### Cross-Insights (FR-7.x)
```
GET    /api/insights/cross           → CrossInsight[]
GET    /api/insights/cross/:id       → CrossInsight
PATCH  /api/insights/cross/:id       → CrossInsight (update status)
POST   /api/insights/analyze         → CrossInsight[] (trigger analysis)
```

---

## State Management Guidelines

### When to use TanStack Query vs Zustand

| Use Case | Tool | Reason |
|----------|------|--------|
| Server data (conversations, opportunities) | TanStack Query | Cache, refetch, mutations |
| UI state (selectedId, filters, modals) | Zustand | Local, synchronous, no cache needed |
| Form state | React Hook Form + Zod | Validation, performance |
| Derived/computed state | Neither - compute inline | Keep it simple |

**Example:**
```typescript
// TanStack Query - server state
const { data: conversations } = useConversations();

// Zustand - UI state
const selectedId = useAppStore((s) => s.selectedConversationId);
const setSelectedId = useAppStore((s) => s.setSelectedConversationId);

// Derived - no state needed
const selectedConversation = conversations?.find(c => c.id === selectedId);
```

---

## Migration Path from Mock Data

1. **E1-S1:** Configurar Drizzle + Turso
2. **E1-S2:** Criar schema e migrations
3. **E1-S3:** Implementar CRUD APIs
4. **Parallel:** Atualizar components para usar hooks em vez de mock-data
5. **Final:** Remover `lib/mock-data.ts`

---

*Documento gerado em 2025-12-01 pelo workflow architecture do BMad Method.*
