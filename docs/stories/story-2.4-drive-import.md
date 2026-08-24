# Story 2.4: Importar do Google Drive

## Status: done

## Description
Como usuário, quero importar transcrições diretamente do Google Drive para processar conversas já existentes na nuvem.

## Acceptance Criteria
- [x] Cliente Google Drive API configurado
- [x] API route para listar arquivos do Drive (txt, docx, pdf)
- [x] API route para listar pastas do Drive
- [x] API route para importar arquivo do Drive
- [x] Componente DriveFilePicker com navegação de pastas
- [x] Modal de importação do Drive
- [x] Botão "Importar do Drive" na página de conversas
- [x] Build passa sem erros

## Implementation Notes

### Files Created
- `lib/drive/client.ts` - Google Drive API client
- `app/api/drive/files/route.ts` - List Drive files
- `app/api/drive/folders/route.ts` - List Drive folders
- `app/api/drive/import/route.ts` - Import file from Drive
- `components/drive/DriveFilePicker.tsx` - File/folder browser
- `components/drive/DriveImportModal.tsx` - Import modal
- `components/drive/index.ts` - Module exports

### Files Modified
- `app/conversas/page.tsx` - Added Drive import button and modal

### Dependencies Added
- `googleapis`

### Technical Details
- Uses Google OAuth token from session for Drive access
- Supports txt, docx, pdf, and Google Docs files
- Google Docs are exported as plain text
- Folder navigation with breadcrumb
- File selection with single-click
- AI processing on import with opportunity extraction
- Opportunities saved to separate table with foreign key

## Testing
- [ ] Manual: Connect Google account
- [ ] Manual: Browse Drive folders
- [ ] Manual: Select and import file
- [ ] Manual: Verify conversation created with AI processing
