# Epic Technical Specification: Ingestão de Transcrições

Date: 2025-12-01
Author: Wesley
Epic ID: 2
Status: Draft

---

## Overview

O Epic 2 implementa a funcionalidade principal do Andresa AI: permitir que usuários façam upload de transcrições, processem-nas com IA, e importem arquivos do Google Drive. Este é o primeiro epic com funcionalidade real para o usuário final.

Este epic transforma o backend implementado no Epic 1 em uma experiência funcional de ingestão de dados.

## Objectives and Scope

### In Scope

- ✅ Upload de arquivos .txt e .json via drag-and-drop
- ✅ Validação de formato e tamanho (máx 10MB)
- ✅ Processamento assíncrono com indicador de progresso
- ✅ Autenticação Google OAuth para Drive
- ✅ Importação de arquivos do Google Drive
- ✅ Metadados e categorização de conversas
- ✅ Integração com AI processing do Epic 1

### Out of Scope

- ❌ Visualização de conversas (Epic 3)
- ❌ Gestão de oportunidades (Epic 4)
- ❌ Cross-conversation intelligence (Epic 5)

## System Architecture Alignment

| Componente | Decisão Arquitetural | ADR |
|------------|---------------------|-----|
| File Upload | react-dropzone | Decision Summary |
| Auth | NextAuth.js v5 | ADR-004 |
| Drive API | Google Drive API v3 | Decision Summary |
| Processing | Inline with streaming | ADR-005 |

**Estrutura de arquivos a criar:**

```
components/
└── upload/
    ├── DropZone.tsx
    ├── FilePreview.tsx
    └── UploadProgress.tsx

lib/
├── auth/
│   └── config.ts           # NextAuth.js config
└── drive/
    └── client.ts           # Google Drive API

app/api/
├── auth/
│   └── [...nextauth]/
│       └── route.ts
├── conversations/
│   └── upload/
│       └── route.ts        # Multipart upload handler
└── drive/
    ├── files/
    │   └── route.ts        # List/search files
    └── import/
        └── route.ts        # Import from Drive
```

## Detailed Design

### Story 2.1: Upload de Arquivos

**Componentes:**
- `DropZone.tsx` - Área de drag-and-drop com react-dropzone
- `FilePreview.tsx` - Preview do arquivo selecionado
- `UploadProgress.tsx` - Barra de progresso

**API Route:**
```typescript
// app/api/conversations/upload/route.ts
POST /api/conversations/upload
Content-Type: multipart/form-data

Body: FormData {
  file: File,        // .txt or .json, max 10MB
  title?: string,
  type?: ConversationType
}

Response 201: { data: Conversation }
Response 400: { error: string } // invalid file
Response 413: { error: string } // file too large
```

### Story 2.2: Processamento de Transcrição

**Flow:**
1. Upload completo → Status: `pendente`
2. Iniciar processamento → Status: `processando`
3. AI extrai insights → Status: `processado`
4. Erro → Status: `erro`

**Progress Stages:**
- "Enviando arquivo..." (0-25%)
- "Analisando conteúdo..." (25-50%)
- "Extraindo insights..." (50-90%)
- "Finalizando..." (90-100%)

### Story 2.3: Autenticação Google OAuth

**NextAuth.js Configuration:**
```typescript
// lib/auth/config.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});
```

### Story 2.4: Importar do Google Drive

**API Routes:**
```typescript
// GET /api/drive/files
// Query: ?q=name contains '.txt'&pageSize=50
// Response: { files: DriveFile[], nextPageToken?: string }

// POST /api/drive/import
// Body: { fileIds: string[] }
// Response: { imported: Conversation[], errors: ImportError[] }
```

### Story 2.5: Metadados e Tipo de Conversa

**Metadata Form Fields:**
- `title` - Editable, auto-suggested by AI
- `type` - Select: reuniao, treinamento, informal, outro
- `tags` - Combobox with autocomplete
- `date` - Date picker
- `duration` - Optional text field

## Dependencies and Integrations

### Dependencies to Add

```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta.25",
    "react-dropzone": "^14.3.5",
    "googleapis": "^144.0.0"
  }
}
```

### Environment Variables

```bash
# .env.local (add to existing)

# Google OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# NextAuth
NEXTAUTH_SECRET=random-32-char-string
NEXTAUTH_URL=http://localhost:3000
```

## Acceptance Criteria Summary

### Story 2.1: Upload de Arquivos
- AC-2.1.1: Área de drag-and-drop funciona
- AC-2.1.2: Aceita apenas .txt e .json
- AC-2.1.3: Limite de 10MB com erro claro
- AC-2.1.4: Barra de progresso visível
- AC-2.1.5: Conversa criada no banco após upload

### Story 2.2: Processamento de Transcrição
- AC-2.2.1: Indicador de progresso com etapas
- AC-2.2.2: Processamento < 2 min para 1h conversa
- AC-2.2.3: Resumo, tópicos, participantes extraídos
- AC-2.2.4: Oportunidades detectadas e salvas
- AC-2.2.5: Conversa aparece na lista após processamento

### Story 2.3: Autenticação Google OAuth
- AC-2.3.1: Botão "Conectar Google Drive" funciona
- AC-2.3.2: Fluxo OAuth redireciona corretamente
- AC-2.3.3: Token armazenado após autorização
- AC-2.3.4: Indicador "Google Drive conectado ✓"
- AC-2.3.5: Pode desconectar a qualquer momento

### Story 2.4: Importar do Google Drive
- AC-2.4.1: Lista arquivos do Drive (.txt, .json)
- AC-2.4.2: Pode navegar pastas
- AC-2.4.3: Seleciona múltiplos arquivos
- AC-2.4.4: Importa e processa automaticamente

### Story 2.5: Metadados e Tipo de Conversa
- AC-2.5.1: Formulário de metadados funciona
- AC-2.5.2: Tipos de conversa disponíveis
- AC-2.5.3: Tags com autocomplete
- AC-2.5.4: AI sugere título e tipo
- AC-2.5.5: Metadados salvos corretamente

## Learnings from Epic 1

**From Story 1.1:**
- Database schema ready with all tables
- Type exports: `Conversation`, `NewConversation`, `Opportunity`

**From Story 1.2:**
- Zod validation pattern in `lib/validators/`
- API route pattern with error handling
- `lib/db/index.ts` uses fallback for build

**From Story 1.3:**
- AI processing available via `processTranscription()`
- Structured output schema in `lib/ai/prompts/`
- Retry with exponential backoff implemented

## Test Strategy

### Manual Testing
- Upload various file types and sizes
- Test OAuth flow end-to-end
- Import from Drive with different file types
- Verify processing completes correctly

### Edge Cases
- Empty files
- Very large files (>10MB)
- Invalid JSON format
- Network interruption during upload
- OAuth token expiration
- Drive API rate limits

---

*Tech spec gerado para Epic 2 - Ingestão de Transcrições*
