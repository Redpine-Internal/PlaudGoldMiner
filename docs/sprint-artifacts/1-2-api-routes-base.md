# Story 1.2: API Routes Base

Status: done

## Story

As a desenvolvedor,
I want criar as API routes estruturais para conversas,
So that o frontend possa se comunicar com o backend via REST.

## Acceptance Criteria

1. **AC-1**: GET /api/conversations retorna lista de conversas com suporte a filtros (status, type, limit)
2. **AC-2**: POST /api/conversations cria nova conversa com validação Zod
3. **AC-3**: GET /api/conversations/[id] retorna conversa específica ou 404
4. **AC-4**: PATCH /api/conversations/[id] atualiza campos parcialmente
5. **AC-5**: DELETE /api/conversations/[id] remove conversa
6. **AC-6**: Erros de validação retornam 400 com detalhes do Zod
7. **AC-7**: Erros de servidor retornam 500 com mensagem genérica

## Tasks / Subtasks

- [x] **Task 1: Instalar dependências de validação** (AC: 2, 6)
  - [x] `npm install zod` (already installed)
  - [x] Verificar compatibilidade com TypeScript 5

- [x] **Task 2: Criar schemas de validação Zod** (AC: 2, 6)
  - [x] Criar `lib/validators/conversation.ts`
  - [x] Schema `conversationCreateSchema` para POST
  - [x] Schema `conversationUpdateSchema` para PATCH
  - [x] Schema `conversationListSchema` para query params
  - [x] Exportar tipos inferidos

- [x] **Task 3: Criar API route de lista e criação** (AC: 1, 2)
  - [x] Criar `app/api/conversations/route.ts`
  - [x] Implementar GET com filtros (status, type, limit)
  - [x] Implementar POST com validação
  - [x] Retornar 201 para criação bem-sucedida

- [x] **Task 4: Criar API route de item específico** (AC: 3, 4, 5)
  - [x] Criar `app/api/conversations/[id]/route.ts`
  - [x] Implementar GET por ID
  - [x] Implementar PATCH para atualização parcial
  - [x] Implementar DELETE
  - [x] Retornar 404 quando não encontrar

- [x] **Task 5: Implementar error handling padronizado** (AC: 6, 7)
  - [x] Criar utility para formatação de erros Zod (`formatZodError`)
  - [x] Retornar 400 para erros de validação
  - [x] Retornar 500 para erros internos
  - [x] Logar erros com contexto estruturado

- [ ] **Task 6: Testar endpoints manualmente** (AC: 1-7) *(requires Turso credentials)*
  - [ ] Testar GET /api/conversations
  - [ ] Testar POST /api/conversations
  - [ ] Testar GET /api/conversations/[id]
  - [ ] Testar PATCH /api/conversations/[id]
  - [ ] Testar DELETE /api/conversations/[id]
  - [ ] Verificar erros de validação

- [x] **Task 7: Verificar build TypeScript** (AC: todos)
  - [x] Executar `npm run build`
  - [x] Corrigir erros de tipo se houver

## Dev Notes

### Decisões Arquiteturais Relevantes

- **API Routes**: Next.js App Router (app/api/...)
- **Validation**: Zod schemas para type-safety em runtime e compile-time
- **Error Handling**: Padrão RESTful com status codes apropriados
- **Database**: Usar cliente Drizzle de `lib/db` criado na Story 1.1

[Source: docs/architecture.md#Implementation-Patterns]

### API Contracts

```typescript
// GET /api/conversations
// Query: ?status=processado&type=reuniao&limit=50
// Response: { data: Conversation[], total: number }

// POST /api/conversations
// Body: { title, date, type, source, ... }
// Response: { data: Conversation }

// GET /api/conversations/[id]
// Response: { data: Conversation } or 404

// PATCH /api/conversations/[id]
// Body: { title?, type?, status?, ... }
// Response: { data: Conversation }

// DELETE /api/conversations/[id]
// Response: 204 No Content or 404
```

[Source: docs/architecture.md#API-Contracts]
[Source: docs/sprint-artifacts/tech-spec-epic-1.md#APIs-and-Interfaces]

### Zod Schema Reference

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
```

[Source: docs/architecture.md#Zod-Validation-Pattern]

### Project Structure Notes

**Arquivos a criar:**
```
lib/
└── validators/
    └── conversation.ts   # Zod schemas

app/api/
└── conversations/
    ├── route.ts          # GET (list), POST (create)
    └── [id]/
        └── route.ts      # GET, PATCH, DELETE
```

[Source: docs/architecture.md#Project-Structure]

### Error Handling Pattern

```typescript
// Standard error response format
try {
  // ... operation
  return Response.json(result);
} catch (error) {
  if (error instanceof z.ZodError) {
    return Response.json({
      error: 'Validation failed',
      details: error.errors
    }, { status: 400 });
  }
  console.error('[API] Error:', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
```

[Source: docs/architecture.md#Error-Handling]

### Learnings from Previous Story

**From Story 1-1-setup-do-banco-de-dados (Status: done)**

- **Database Client Available**: Use `import { db } from '@/lib/db'` - client is ready
- **Schema Types Exported**: Use `Conversation`, `NewConversation` from `@/lib/db/schema`
- **Tables Available**: conversations, opportunities, contents, contentSources, crossInsights, crossInsightConversations
- **Type Compatibility Note**: Fixed status enum values in mock-data.ts (no spaces allowed)
- **Turso Credentials**: User needs to configure `.env.local` - API routes will fail without valid credentials

[Source: docs/sprint-artifacts/1-1-setup-do-banco-de-dados.md#Dev-Agent-Record]

### Import Pattern

```typescript
// 1. External libraries
import { z } from 'zod';

// 2. Internal - lib
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';

// 3. Internal - validators
import { conversationCreateSchema } from '@/lib/validators/conversation';
```

[Source: docs/architecture.md#Import-Order]

### References

- [Drizzle ORM Queries](https://orm.drizzle.team/docs/select)
- [Zod Documentation](https://zod.dev/)
- [Source: docs/architecture.md#API-Route-Pattern]
- [Source: docs/architecture.md#Zod-Validation-Pattern]
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md#APIs-and-Interfaces]
- [Source: docs/epics.md#Story-1.2]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

<!-- To be filled by dev agent -->

### Debug Log References

<!-- To be filled during implementation -->

### Completion Notes List

- All code implementation complete
- TypeScript build passes (`npm run build`)
- API routes available at `/api/conversations` and `/api/conversations/[id]`
- Zod validators created with type inference
- Error handling follows RESTful conventions
- Updated `lib/db/index.ts` to use fallback `file:local.db` during build (allows build without Turso credentials)
- Manual testing requires Turso credentials configured in `.env.local`

### File List

- NEW: lib/validators/conversation.ts
- NEW: app/api/conversations/route.ts
- NEW: app/api/conversations/[id]/route.ts
- MODIFIED: lib/db/index.ts (added fallback for build)
