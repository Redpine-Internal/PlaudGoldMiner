import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Protege todas as rotas: sem sessão Supabase → redireciona para /login.
// Também refresca a sessão a cada request (mantém o cookie válido).
export async function middleware(request: NextRequest) {
  // Rotas de ingestão (cron do Scheduler / operador) não têm sessão de navegador:
  // autenticam pelo INGEST_CRON_SECRET. Só passam direto se o segredo confere;
  // sem o header correto, caem na proteção por sessão como qualquer rota.
  if (request.nextUrl.pathname.startsWith('/api/plaud/ingest')) {
    const ingestSecret = process.env.INGEST_CRON_SECRET;
    if (
      ingestSecret &&
      request.headers.get('x-ingest-secret') === ingestSecret
    ) {
      return NextResponse.next({ request });
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login';

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Já logado tentando ver /login → manda para a home.
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Roda em tudo, exceto assets estáticos e as rotas do NextAuth/Google (Drive).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|auth/signout|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
