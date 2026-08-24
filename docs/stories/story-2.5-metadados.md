# Story 2.5: Metadados e Tipo de Conversa

## Status: done

## Description
Como Andresa, quero categorizar minhas conversas para poder filtrar e organizar depois.

## Acceptance Criteria
- [x] Formulário de metadados funciona
- [x] Tipos de conversa disponíveis (reunião, treinamento, informal, outro)
- [x] Tags com input customizado
- [x] AI sugere título e tipo
- [x] Metadados salvos corretamente
- [x] Build passa sem erros

## Implementation Notes

### Files Created
- `components/upload/MetadataForm.tsx` - Reusable metadata form component

### Files Modified
- `components/upload/UploadModal.tsx` - Added wizard flow with metadata step
- `components/upload/index.ts` - Export MetadataForm

### Technical Details
- Two-step wizard: Upload → Metadata
- AI suggestions for title and type displayed inline
- Type selection with colored badges
- Tags input with autocomplete support (UI ready, API for existing tags can be added)
- Date picker and optional duration field
- Form validation (title required)
- Metadata saved via PATCH to `/api/conversations/[id]`

### UI/UX
- Step indicator showing progress
- AI suggestion buttons inline with fields
- Colored type badges matching design system
- Tag chips with remove button

## Testing
- [ ] Manual: Upload file and see metadata form
- [ ] Manual: AI suggestions appear after processing
- [ ] Manual: Edit title, type, date, duration, tags
- [ ] Manual: Save and verify data in database
