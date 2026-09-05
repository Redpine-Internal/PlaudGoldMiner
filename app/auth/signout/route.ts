import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Encerra a sessão do Supabase (limpa cookies) e volta para /login.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: 'Não foi possível encerrar sua sessão. Tente novamente.' }, { status: 502 });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url, { status: 303 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível encerrar sua sessão. Tente novamente.' }, { status: 500 });
  }
}
