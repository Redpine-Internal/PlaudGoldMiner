import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedUserEmail } from '@/lib/auth/access';
import { createClient } from '@/lib/supabase/server';
import { requestOrigin } from '@/lib/auth/request-origin';

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

// O @supabase/ssr guarda o code_verifier do PKCE em cookie (path=/, SameSite=Lax),
// num slot endereçado pelo id do fluxo: `{storageKey}-flow-{id}-code-verifier`.
// O id viaja na URL de retorno como `sb_flow_id`. Sem repassá-lo ao
// exchangeCodeForSession, o auth-js cai no slot legado `{storageKey}-code-verifier`,
// que só existe por compatibilidade e não é o slot do fluxo em curso — a troca
// falha com "code verifier missing" e a tela fica em branco.
//
// O formato é validado antes de ser repassado: o valor vem da query string, e é
// usado para montar uma chave de storage. O padrão espelha `validatePKCEFlowId`
// do auth-js em vez de assumir o formato que `generatePKCEFlowId` produz hoje
// (32 hexadecimais) — casar com o gerador tornaria o login dependente de um
// detalhe interno, e uma mudança de formato no pacote passaria a rejeitar ids
// legítimos, derrubando o SSO silenciosamente.
const FLOW_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

function safeFlowId(value: string | null) {
  return value && FLOW_ID_PATTERN.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const flowId = safeFlowId(request.nextUrl.searchParams.get('sb_flow_id'));
  const origin = requestOrigin(request);

  // O Entra ID pode recusar antes de emitir o code — o caso mais comum é o
  // tenant exigir consentimento de administrador para o app. Sem distinguir
  // esse motivo, o usuário recebe "tente novamente" e repete um fluxo que
  // nunca vai passar sozinho.
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    const reason =
      providerError === 'access_denied' ||
      request.nextUrl.searchParams.get('error_subcode') === 'cancel'
        ? 'consent'
        : 'sso';
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isAllowedUserEmail(user?.email)) {
        return NextResponse.redirect(new URL(next, origin));
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/login?error=access', origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=sso', origin));
}
