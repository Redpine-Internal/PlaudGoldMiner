# Story 2.1: Upload de Arquivos

Status: done

## Story

As a Andresa,
I want fazer upload de arquivos .txt e .json,
So that minhas transcrições sejam importadas para análise.

## Acceptance Criteria

1. **AC-1**: Área de drag-and-drop funcional na página de conversas
2. **AC-2**: Aceita apenas arquivos .txt e .json
3. **AC-3**: Limite de 10MB por arquivo com erro claro
4. **AC-4**: Barra de progresso visível durante upload
5. **AC-5**: Conversa criada no banco com status "pendente" após upload
6. **AC-6**: Erro claro se formato inválido

## Tasks / Subtasks

- [x] **Task 1: Instalar dependências** (AC: 1)
  - [x] `npm install react-dropzone`

- [x] **Task 2: Criar componente DropZone** (AC: 1, 2, 3, 6)
  - [x] Criar `components/upload/DropZone.tsx`
  - [x] Implementar drag-and-drop
  - [x] Validar extensões (.txt, .json)
  - [x] Validar tamanho (max 10MB)
  - [x] Mostrar erros de validação

- [x] **Task 3: Criar componente de progresso** (AC: 4)
  - [x] Criar `components/upload/UploadProgress.tsx`
  - [x] Barra de progresso animada
  - [x] Mostrar porcentagem

- [x] **Task 4: Criar API route de upload** (AC: 5)
  - [x] Criar `app/api/conversations/upload/route.ts`
  - [x] Aceitar multipart/form-data
  - [x] Salvar transcrição no banco
  - [x] Retornar conversa criada

- [x] **Task 5: Integrar na página de conversas** (AC: 1-6)
  - [x] Adicionar modal de upload
  - [x] Botão "Nova Conversa" abre modal
  - [x] Integrar com DropZone

- [x] **Task 6: Verificar build** (AC: todos)
  - [x] `npm run build`

## Dev Notes

### Learnings from Epic 1

- Use `db` from `@/lib/db` for database operations
- Use Zod for validation (`lib/validators/`)
- API routes follow pattern in `app/api/conversations/route.ts`

### References

- [react-dropzone docs](https://react-dropzone.js.org/)
- [Source: docs/sprint-artifacts/tech-spec-epic-2.md]
- [Source: docs/epics.md#Story-2.1]

## Dev Agent Record

### Completion Notes List

- All components implemented with TypeScript
- Drag-and-drop upload working with react-dropzone
- File validation (size, type) with clear error messages
- Upload API saves to database and triggers AI processing
- Modal integrated in conversas page with "Nova Conversa" button
- Build passes successfully

### File List

- NEW: components/upload/DropZone.tsx
- NEW: components/upload/UploadProgress.tsx
- NEW: components/upload/UploadModal.tsx
- NEW: components/upload/index.ts
- NEW: lib/validators/upload.ts
- NEW: app/api/conversations/upload/route.ts
- MODIFIED: app/conversas/page.tsx (added upload button and modal)
- MODIFIED: package.json (added react-dropzone)
