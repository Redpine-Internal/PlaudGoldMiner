# Story 2.2: Processamento de Transcrição

Status: done

## Story

As a Andresa,
I want que minha transcrição seja processada automaticamente,
So that eu tenha resumo e insights sem esforço.

## Acceptance Criteria

1. **AC-1**: Indicador de progresso com etapas (Enviando, Analisando, Extraindo, Finalizando)
2. **AC-2**: Processamento < 2 min para 1h conversa
3. **AC-3**: Resumo, tópicos, participantes extraídos
4. **AC-4**: Oportunidades detectadas e salvas no banco
5. **AC-5**: Conversa aparece na lista após processamento

## Tasks / Subtasks

- [x] **Task 1: Indicador de progresso** (AC: 1)
  - [x] UploadProgress component with stages
  - [x] Progress updates during processing

- [x] **Task 2: Integrar processamento no upload flow** (AC: 2-5)
  - [x] UploadModal calls /api/process after upload
  - [x] /api/process updates conversation status
  - [x] Opportunities saved from AI response

- [x] **Task 3: Verificar build** (AC: todos)
  - [x] `npm run build`

## Dev Notes

### Implementation Notes

Story 2.2 was largely implemented as part of Story 2.1's UploadModal component:

1. **UploadProgress.tsx** shows stages: Enviando → Analisando → Extraindo → Finalizando
2. **UploadModal.tsx** chains upload → process in sequence
3. **/api/process/route.ts** (from Story 1.3) handles AI processing
4. AI results saved: summary, topics, participants, opportunities

The processing flow is:
1. Upload file → POST /api/conversations/upload → status: pendente
2. Trigger AI → POST /api/process → status: processando → processado
3. Opportunities created automatically from AI response

### References

- [Source: components/upload/UploadModal.tsx]
- [Source: app/api/process/route.ts]
- [Source: lib/ai/services/transcription-processor.ts]

## Dev Agent Record

### Completion Notes List

- Processing integrated into UploadModal flow
- Progress indicator shows 4 stages
- AI processing via /api/process endpoint
- Opportunities auto-created from AI response
- Status updates: pendente → processando → processado

### File List

- EXISTING: components/upload/UploadProgress.tsx (from Story 2.1)
- EXISTING: components/upload/UploadModal.tsx (from Story 2.1)
- EXISTING: app/api/process/route.ts (from Story 1.3)
