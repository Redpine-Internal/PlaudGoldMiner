# Story 2.3: Autenticação Google OAuth

## Status: done

## Description
Como usuário, quero conectar minha conta Google para poder importar transcrições diretamente do Google Drive.

## Acceptance Criteria
- [x] Configuração NextAuth.js v5 com Google Provider
- [x] Escopo de acesso ao Google Drive (readonly)
- [x] Refresh token para acesso persistente
- [x] SessionProvider no layout raiz
- [x] Componente GoogleConnectButton
- [x] Build passa sem erros

## Implementation Notes

### Files Created
- `lib/auth/config.ts` - NextAuth configuration with Google OAuth
- `app/api/auth/[...nextauth]/route.ts` - Auth API routes
- `components/auth/SessionProvider.tsx` - Client-side session provider
- `components/auth/GoogleConnectButton.tsx` - Connect/disconnect button
- `components/auth/index.ts` - Module exports

### Files Modified
- `app/layout.tsx` - Added SessionProvider wrapper

### Dependencies Added
- `next-auth@beta` (v5)

### Environment Variables Required
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_SECRET=
```

### Technical Details
- Uses NextAuth.js v5 beta with App Router support
- Token refresh implemented in JWT callback
- Session extended with accessToken for Drive API calls
- Error handling for token refresh failures

## Testing
- [ ] Manual: Sign in with Google
- [ ] Manual: Verify Drive scope granted
- [ ] Manual: Token refresh after expiry
