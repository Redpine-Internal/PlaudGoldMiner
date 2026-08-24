# Epic Technical Specification: Foundation & Backend Core

Date: 2025-12-01
Author: Wesley
Epic ID: 1
Status: Draft

---

## Overview

O Epic 1 estabelece a fundação técnica necessária para o Andresa AI, transformando o protótipo frontend existente em uma aplicação full-stack funcional. Este epic implementa a camada de persistência de dados com Drizzle ORM + Turso, as API Routes para comunicação frontend-backend, e a integração com AI (Vercel AI SDK + Claude) para processamento de transcrições.

Este é um epic de infraestrutura que habilita todos os demais épicos - sem a base de dados e APIs, nenhuma funcionalidade de negócio pode ser implementada. A exceção é que este epic é permitido como "técnico" por ser o primeiro de um projeto brownfield.

## Objectives and Scope

### In Scope

- ✅ Configuração do Drizzle ORM com Turso (SQLite edge)
- ✅ Schema de banco com 7 tabelas: conversations, opportunities, contents, contentSources, crossInsights, crossInsightConversations
- ✅ Migrations e seed data para desenvolvimento
- ✅ API Routes CRUD para conversations (GET, POST, PATCH, DELETE)
- ✅ Integração com Vercel AI SDK + Claude (Anthropic)
- ✅ Serviço abstrato de AI com prompts configuráveis
- ✅ Validação de inputs com Zod
- ✅ Error handling padronizado
- ✅ Environment variables setup

### Out of Scope

- ❌ Upload de arquivos (Epic 2)
- ❌ Google OAuth / Drive integration (Epic 2)
- ❌ UI de conversas com dados reais (Epic 3)
- ❌ Processamento de oportunidades (Epic 4)
- ❌ Cross-conversation intelligence (Epic 5)
- ❌ Autenticação de usuário (não é requisito do MVP)

## System Architecture Alignment

Este epic implementa os seguintes componentes definidos no Architecture Decision Document:

| Componente | Decisão Arquitetural | ADR |
|------------|---------------------|-----|
| Database | Drizzle ORM + Turso | ADR-001 |
| AI Provider | Vercel AI SDK + Claude | ADR-002 |
| Validation | Zod schemas | Decision Summary |
| API Routes | Next.js App Router | ADR-001 |

**Estrutura de arquivos a criar:**

```
lib/
├── db/
│   ├── index.ts          # Drizzle client
│   ├── schema.ts         # Schema completo
│   └── migrations/       # SQL migrations
├── ai/
│   ├── client.ts         # Vercel AI SDK setup
│   └── prompts/
│       └── generate-summary.ts
└── validators/
    └── conversation.ts   # Zod schemas

app/api/
└── conversations/
    ├── route.ts          # GET (list), POST (create)
    └── [id]/
        └── route.ts      # GET, PATCH, DELETE

drizzle.config.ts         # Drizzle configuration
.env.local                # Environment variables
```

## Detailed Design

### Services and Modules

| Módulo | Responsabilidade | Inputs | Outputs |
|--------|-----------------|--------|---------|
| `lib/db/index.ts` | Cliente Drizzle + conexão Turso | TURSO_DATABASE_URL, TURSO_AUTH_TOKEN | db client |
| `lib/db/schema.ts` | Definição de tabelas | - | Schema types |
| `lib/ai/client.ts` | Configuração Vercel AI SDK | ANTHROPIC_API_KEY | AI client |
| `lib/validators/conversation.ts` | Schemas Zod | Request data | Validated data / errors |
| `app/api/conversations/route.ts` | CRUD de conversas | HTTP requests | JSON responses |

### Data Models and Contracts

```typescript
// lib/db/schema.ts - Schema Completo

import { sqliteTable, text, integer, real, sql } from 'drizzle-orm/sqlite-core';

// ===== CONVERSATIONS =====
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  duration: text('duration'),
  type: text('type', { enum: ['reuniao', 'treinamento', 'informal', 'outro'] }).notNull(),
  status: text('status', { enum: ['pendente', 'processando', 'processado', 'erro'] }).notNull().default('pendente'),
  transcription: text('transcription'),
  summary: text('summary'),
  topics: text('topics'),           // JSON array
  participants: text('participants'), // JSON array
  tags: text('tags'),               // JSON array
  source: text('source', { enum: ['plaud', 'drive', 'upload'] }).notNull(),
  sourceFileId: text('source_file_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ===== OPPORTUNITIES =====
export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  title: text('title').notNull(),
  pain: text('pain').notNull(),
  context: text('context'),
  score: real('score').notNull(),
  type: text('type', { enum: ['produto', 'sistema', 'consultoria', 'servico'] }).notNull(),
  status: text('status', { enum: ['nova', 'analise', 'qualificada', 'descartada'] }).notNull().default('nova'),
  notes: text('notes'),
  tags: text('tags'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ===== CONTENTS =====
export const contents = sqliteTable('contents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  platform: text('platform', { enum: ['youtube', 'linkedin', 'blog'] }).notNull(),
  theme: text('theme').notNull(),
  outline: text('outline'),
  mentionCount: integer('mention_count').notNull().default(1),
  relevanceScore: real('relevance_score').notNull(),
  status: text('status', { enum: ['sugerido', 'producao', 'publicado', 'descartado'] }).notNull().default('sugerido'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ===== CONTENT SOURCES =====
export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),
  contentId: text('content_id').references(() => contents.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  excerpt: text('excerpt'),
});

// ===== CROSS INSIGHTS =====
export const crossInsights = sqliteTable('cross_insights', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  pattern: text('pattern').notNull(),
  conversationIds: text('conversation_ids'), // JSON array
  insightType: text('insight_type', {
    enum: ['pattern', 'connection', 'suggestion', 'trend']
  }).notNull(),
  confidence: real('confidence').notNull(),
  status: text('status', {
    enum: ['new', 'useful', 'ignored', 'implemented']
  }).notNull().default('new'),
  actionSuggestion: text('action_suggestion'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// ===== CROSS INSIGHT CONVERSATIONS (M:N) =====
export const crossInsightConversations = sqliteTable('cross_insight_conversations', {
  id: text('id').primaryKey(),
  crossInsightId: text('cross_insight_id').references(() => crossInsights.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  relevance: text('relevance'),
});

// ===== TYPE EXPORTS =====
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Opportunity = typeof opportunities.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type CrossInsight = typeof crossInsights.$inferSelect;
```

### APIs and Interfaces

#### GET /api/conversations

```typescript
// Request
GET /api/conversations?status=processado&type=reuniao&limit=50

// Query Parameters (all optional)
{
  status?: 'pendente' | 'processando' | 'processado' | 'erro',
  type?: 'reuniao' | 'treinamento' | 'informal' | 'outro',
  limit?: number (1-100, default 50)
}

// Response 200
{
  data: Conversation[],
  total: number
}

// Response 500
{
  error: string
}
```

#### POST /api/conversations

```typescript
// Request
POST /api/conversations
Content-Type: application/json

{
  title: string,          // required, 1-200 chars
  date: string | Date,    // required, ISO date
  duration?: string,
  type: 'reuniao' | 'treinamento' | 'informal' | 'outro',
  transcription?: string,
  source: 'plaud' | 'drive' | 'upload',
  sourceFileId?: string
}

// Response 201
{
  data: Conversation
}

// Response 400
{
  error: string,
  details?: ZodError
}
```

#### GET /api/conversations/[id]

```typescript
// Response 200
{
  data: Conversation
}

// Response 404
{
  error: 'Conversation not found'
}
```

#### PATCH /api/conversations/[id]

```typescript
// Request - partial update
{
  title?: string,
  type?: string,
  status?: string,
  tags?: string[],
  // ... any field
}

// Response 200
{
  data: Conversation
}
```

#### DELETE /api/conversations/[id]

```typescript
// Response 204
(no body)

// Response 404
{
  error: 'Conversation not found'
}
```

### Workflows and Sequencing

```
Story 1.1: Setup do Banco de Dados
┌─────────────────────────────────────────────────────────────┐
│ 1. npm install drizzle-orm @libsql/client                   │
│ 2. npm install -D drizzle-kit                               │
│ 3. Criar .env.local com TURSO_DATABASE_URL, TURSO_AUTH_TOKEN│
│ 4. Criar lib/db/schema.ts com todas as tabelas              │
│ 5. Criar drizzle.config.ts                                  │
│ 6. Criar lib/db/index.ts (cliente)                          │
│ 7. Executar: npx drizzle-kit generate                       │
│ 8. Executar: npx drizzle-kit push                           │
│ 9. Criar seed data (opcional)                               │
└─────────────────────────────────────────────────────────────┘

Story 1.2: API Routes Base
┌─────────────────────────────────────────────────────────────┐
│ 1. Criar lib/validators/conversation.ts (Zod schemas)       │
│ 2. Criar app/api/conversations/route.ts (GET, POST)         │
│ 3. Criar app/api/conversations/[id]/route.ts (GET,PATCH,DEL)│
│ 4. Testar com curl/Postman                                  │
│ 5. Verificar tipos TypeScript                               │
└─────────────────────────────────────────────────────────────┘

Story 1.3: Integração com IA
┌─────────────────────────────────────────────────────────────┐
│ 1. npm install ai @ai-sdk/anthropic                         │
│ 2. Adicionar ANTHROPIC_API_KEY em .env.local                │
│ 3. Criar lib/ai/client.ts                                   │
│ 4. Criar lib/ai/prompts/generate-summary.ts                 │
│ 5. Testar com transcrição de exemplo                        │
│ 6. Implementar retry e error handling                       │
└─────────────────────────────────────────────────────────────┘
```

## Non-Functional Requirements

### Performance

| Requisito | Métrica | Fonte |
|-----------|---------|-------|
| Lista de conversas | < 1s | NFR-1.3 |
| Interface responsiva | < 200ms | NFR-1.2 |
| Conexão Turso | < 100ms cold start | Turso SLA |

**Implementação:**
- Turso é edge-native, latência ~10-50ms
- Queries simples, sem joins complexos
- Índices em campos de filtro (status, type, date)

### Security

| Requisito | Implementação | Fonte |
|-----------|--------------|-------|
| API keys seguras | Environment variables (.env.local) | NFR-3.3 |
| HTTPS | Vercel default | NFR-3.2 |
| Input validation | Zod schemas em todas as rotas | Best practice |

**Notas:**
- MVP é uso pessoal, sem autenticação complexa (NFR-3.4)
- Turso oferece criptografia em repouso por padrão (NFR-3.1)

### Reliability/Availability

| Requisito | Implementação |
|-----------|--------------|
| Database availability | Turso: 99.9% SLA |
| AI fallback | Retry com exponential backoff (3 tentativas) |
| Error recovery | Graceful degradation - retornar erro amigável |

### Observability

| Signal | Implementação |
|--------|--------------|
| Errors | console.error com contexto estruturado |
| API latency | Log de tempo de resposta |
| AI calls | Log de tokens usados e tempo |

**Exemplo de log estruturado:**
```typescript
console.error('[API] Error:', {
  route: '/api/conversations',
  method: 'POST',
  error: error.message,
  timestamp: new Date().toISOString()
});
```

## Dependencies and Integrations

### Dependencies to Add

```json
{
  "dependencies": {
    "drizzle-orm": "^0.38.x",
    "@libsql/client": "^0.14.x",
    "ai": "^4.x",
    "@ai-sdk/anthropic": "^1.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.x"
  }
}
```

### Existing Dependencies (preserve)

```json
{
  "next": "16.0.5",
  "react": "19.2.0",
  "zustand": "^5.0.8",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

### External Integrations

| Service | Purpose | Setup Required |
|---------|---------|----------------|
| Turso | Database | Criar conta, criar database, obter URL e token |
| Anthropic | AI | Criar conta, obter API key |

### Environment Variables

```bash
# .env.local

# Database (Turso)
TURSO_DATABASE_URL=libsql://[database]-[org].turso.io
TURSO_AUTH_TOKEN=eyJ...

# AI (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...
```

## Acceptance Criteria (Authoritative)

### Story 1.1: Setup do Banco de Dados

1. **AC-1.1.1**: Drizzle ORM está instalado e configurado com Turso
2. **AC-1.1.2**: Schema define todas as 7 tabelas (conversations, opportunities, contents, contentSources, crossInsights, crossInsightConversations)
3. **AC-1.1.3**: Arquivo do banco é acessível em Turso cloud
4. **AC-1.1.4**: Migrations estão configuradas para versionamento (drizzle-kit)
5. **AC-1.1.5**: Comando `npm run db:push` executa migrations com sucesso

### Story 1.2: API Routes Base

1. **AC-1.2.1**: GET /api/conversations retorna lista de conversas com paginação
2. **AC-1.2.2**: POST /api/conversations cria nova conversa com validação Zod
3. **AC-1.2.3**: GET /api/conversations/[id] retorna conversa específica ou 404
4. **AC-1.2.4**: PATCH /api/conversations/[id] atualiza campos parcialmente
5. **AC-1.2.5**: DELETE /api/conversations/[id] remove conversa
6. **AC-1.2.6**: Erros de validação retornam 400 com detalhes
7. **AC-1.2.7**: Erros de servidor retornam 500 com mensagem genérica

### Story 1.3: Integração com IA

1. **AC-1.3.1**: Vercel AI SDK + Anthropic está configurado
2. **AC-1.3.2**: Serviço de AI aceita texto e retorna resposta estruturada
3. **AC-1.3.3**: Retry com exponential backoff (3 tentativas)
4. **AC-1.3.4**: Timeout de 60 segundos para requisições longas
5. **AC-1.3.5**: Erros de API são tratados graciosamente

## Traceability Mapping

| AC | Spec Section | Component | Test Idea |
|----|--------------|-----------|-----------|
| AC-1.1.1 | Data Models | lib/db/index.ts | Unit: db client connects |
| AC-1.1.2 | Data Models | lib/db/schema.ts | Unit: schema exports 7 tables |
| AC-1.1.3 | Dependencies | Turso | Integration: query returns data |
| AC-1.1.4 | Workflows | drizzle.config.ts | Manual: generate works |
| AC-1.1.5 | Workflows | package.json | Manual: db:push succeeds |
| AC-1.2.1 | APIs | app/api/conversations/route.ts | Integration: GET returns array |
| AC-1.2.2 | APIs | app/api/conversations/route.ts | Integration: POST creates record |
| AC-1.2.3 | APIs | app/api/conversations/[id]/route.ts | Integration: GET by ID |
| AC-1.2.4 | APIs | app/api/conversations/[id]/route.ts | Integration: PATCH updates |
| AC-1.2.5 | APIs | app/api/conversations/[id]/route.ts | Integration: DELETE removes |
| AC-1.2.6 | APIs | lib/validators/conversation.ts | Unit: Zod rejects invalid |
| AC-1.2.7 | APIs | Error handling | Integration: 500 on DB error |
| AC-1.3.1 | Dependencies | lib/ai/client.ts | Unit: client initializes |
| AC-1.3.2 | Services | lib/ai/prompts/ | Integration: returns structured |
| AC-1.3.3 | Reliability | lib/ai/client.ts | Unit: retry logic works |
| AC-1.3.4 | Performance | lib/ai/client.ts | Unit: timeout configured |
| AC-1.3.5 | Reliability | lib/ai/client.ts | Unit: error caught |

## Risks, Assumptions, Open Questions

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Turso cold start lento | Médio | Baixa | Free tier tem keep-alive; Pro tem replicas |
| API key exposta em client | Alto | Baixa | Usar apenas em server-side (API routes) |
| Schema migration quebra dados | Alto | Baixa | Testar em staging; backup antes de push |

### Assumptions

1. **A-1**: Wesley já tem conta no Turso ou vai criar
2. **A-2**: Wesley já tem conta no Anthropic ou vai criar
3. **A-3**: Ambiente de desenvolvimento é local (npm run dev)
4. **A-4**: Deploy será no Vercel (configuração posterior)

### Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Usar Turso free tier ou Pro? | Wesley | Pendente |
| Q2 | Qual modelo Claude usar? (sonnet vs haiku) | Wesley | Pendente - sugestão: claude-sonnet-4-20250514 para qualidade |

## Test Strategy Summary

### Test Levels

| Level | Framework | Coverage |
|-------|-----------|----------|
| Unit | Vitest | Validators, schema exports, utility functions |
| Integration | Vitest + next/test | API routes end-to-end |
| Manual | curl/Postman | Smoke tests durante desenvolvimento |

### Test Plan

1. **Unit Tests (Story 1.1)**
   - Schema exports all tables
   - DB client connects successfully

2. **Unit Tests (Story 1.2)**
   - Zod schema validates correct input
   - Zod schema rejects invalid input
   - Error responses have correct format

3. **Integration Tests (Story 1.2)**
   - CRUD operations work end-to-end
   - Filters work correctly
   - Pagination works

4. **Integration Tests (Story 1.3)**
   - AI client returns structured response
   - Retry works on failure
   - Timeout is respected

### Edge Cases to Test

- Empty database (no conversations)
- Invalid UUID for conversation ID
- Very long transcription text
- Network failure during AI call
- Concurrent requests to same resource
