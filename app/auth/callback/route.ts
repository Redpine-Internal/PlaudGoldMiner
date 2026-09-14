import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedUserEmail } from '@/lib/auth/access';
import { createClient } from '@/lib/supabase/server';

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    .trim();
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    .trim();

  if (
    forwardedHost &&
    (forwardedProto === 'https' || forwardedProto === 'http')
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const origin = requestOrigin(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
