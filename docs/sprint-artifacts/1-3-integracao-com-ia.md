# Story 1.3: Integração com IA

Status: done

## Story

As a desenvolvedor,
I want configurar a integração com Claude (Anthropic) via Vercel AI SDK,
So that transcrições possam ser processadas e analisadas automaticamente.

## Acceptance Criteria

1. **AC-1**: Vercel AI SDK + Anthropic está configurado e funcionando
2. **AC-2**: Serviço de AI aceita texto de transcrição e retorna resposta estruturada contendo:
   - Resumo da conversa
   - Tópicos principais
   - Participantes identificados
   - Oportunidades detectadas
   - Problemas/dores mencionados
3. **AC-3**: Retry com exponential backoff (3 tentativas) em caso de erro
4. **AC-4**: Timeout de 60 segundos para requisições longas
5. **AC-5**: Erros de API são tratados graciosamente com mensagens claras

## Tasks / Subtasks

- [x] **Task 1: Instalar dependências de AI** (AC: 1)
  - [x] `npm install ai @ai-sdk/anthropic`
  - [x] Verificar compatibilidade com Next.js 16

- [x] **Task 2: Configurar cliente AI** (AC: 1, 4)
  - [x] Criar `lib/ai/client.ts`
  - [x] Configurar Anthropic provider
  - [x] Configurar timeout e retry config

- [x] **Task 3: Criar prompts de processamento** (AC: 2)
  - [x] Criar `lib/ai/prompts/process-transcription.ts`
  - [x] Definir schema Zod para resposta estruturada
  - [x] Otimizar prompt para extração de insights

- [x] **Task 4: Implementar serviço de processamento** (AC: 2, 3, 5)
  - [x] Criar `lib/ai/services/transcription-processor.ts`
  - [x] Implementar função `processTranscription`
  - [x] Implementar retry com exponential backoff
  - [x] Implementar error handling

- [x] **Task 5: Criar API route de processamento** (AC: 1-5)
  - [x] Criar `app/api/process/route.ts`
  - [x] Integrar com serviço de processamento
  - [x] Retornar resultado estruturado

- [x] **Task 6: Verificar build TypeScript** (AC: todos)
  - [x] Executar `npm run build`
  - [x] Corrigir erros de tipo se houver

## Dev Notes

### Decisões Arquiteturais Relevantes

- **ADR-002**: Vercel AI SDK + Claude escolhido por ser superior para textos longos e ter streaming nativo
- **AI Provider**: Anthropic Claude (claude-sonnet-4-20250514 recomendado)
- **Structured Output**: Usar `generateObject` do Vercel AI SDK com schema Zod

[Source: docs/architecture.md#ADR-002]

### AI Processing Pattern

```typescript
// lib/ai/processors/conversation-processor.ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { transcriptionResultSchema } from '@/lib/validators/ai';

export async function processTranscription(transcription: string) {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: transcriptionResultSchema,
    prompt: `Analise esta transcrição...`,
  });
  return object;
}
```

[Source: docs/architecture.md#AI-Processing-Pattern]

### Project Structure Notes

**Arquivos a criar:**
```
lib/
└── ai/
    ├── client.ts                    # Vercel AI SDK setup
    ├── prompts/
    │   └── process-transcription.ts # Prompt template
    └── services/
        └── transcription-processor.ts

app/api/
└── process/
    └── route.ts                     # POST trigger AI processing
```

[Source: docs/architecture.md#Project-Structure]

### Environment Variables

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

[Source: docs/architecture.md#Environment-Variables]

### Learnings from Previous Stories

**From Story 1-1-setup-do-banco-de-dados (Status: done)**
- Database schema ready with all tables
- Type exports available from `@/lib/db/schema`

**From Story 1-2-api-routes-base (Status: done)**
- Zod validation pattern established in `lib/validators/`
- Error handling pattern with `formatZodError`
- API route pattern with try/catch and proper status codes
- `lib/db/index.ts` uses fallback for build without env vars

[Source: docs/sprint-artifacts/1-1-setup-do-banco-de-dados.md#Dev-Agent-Record]
[Source: docs/sprint-artifacts/1-2-api-routes-base.md#Dev-Agent-Record]

### References

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Anthropic Provider](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic)
- [Source: docs/architecture.md#AI-Processing-Pattern]
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md]
- [Source: docs/epics.md#Story-1.3]

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
- API route available at `POST /api/process`
- Vercel AI SDK with Anthropic provider configured
- Exponential backoff retry (3 attempts, 1s-10s delay)
- Structured output with Zod schema validation
- Process endpoint updates conversation and creates opportunities automatically
- Testing requires ANTHROPIC_API_KEY and Turso credentials in `.env.local`

### File List

- NEW: lib/ai/client.ts
- NEW: lib/ai/prompts/process-transcription.ts
- NEW: lib/ai/services/transcription-processor.ts
- NEW: app/api/process/route.ts
- MODIFIED: package.json (added ai, @ai-sdk/anthropic)
