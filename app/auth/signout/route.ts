import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Encerra a sessão do Supabase (limpa cookies) e volta para /login.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url, { status: 303 });
}
