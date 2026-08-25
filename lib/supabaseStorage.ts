import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client de Storage ISOLADO do projeto SISTEMA. NUNCA usar as chaves *_EMBEDINGS.
// Só deve ser importado em código de servidor (rotas de API).
const BUCKET = 'idea-enrichment';

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL_SISTEMA;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA;
  if (!url || !key) {
    throw new Error('SUPABASE_URL_SISTEMA / SUPABASE_SERVICE_ROLE_KEY_SISTEMA ausentes');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}

/** Cria uma URL assinada de upload para um caminho e devolve também a URL pública. */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const s = client();
  const { data, error } = await s.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Falha ao criar signed upload URL: ${error?.message}`);
  }
  const { data: pub } = s.storage.from(BUCKET).getPublicUrl(path);
  return { path: data.path, signedUrl: data.signedUrl, token: data.token, publicUrl: pub.publicUrl };
}

/** Remove um objeto do bucket (best-effort). */
export async function removeObject(path: string): Promise<void> {
  const s = client();
  const { error } = await s.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Falha ao remover objeto: ${error.message}`);
}
