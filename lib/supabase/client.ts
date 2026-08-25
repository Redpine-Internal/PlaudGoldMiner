import { createBrowserClient } from '@supabase/ssr';

// Cliente Supabase para o navegador. Usado no login (signInWithPassword) e logout.
// A anon key é pública por design.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
