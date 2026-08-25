import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL_SISTEMA;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA;

async function main() {
  if (!url || !key) {
    console.error('MISSING SUPABASE_URL_SISTEMA / SUPABASE_SERVICE_ROLE_KEY_SISTEMA');
    process.exit(1);
  }
  const s = createClient(url, key);
  const { data, error } = await s.storage.getBucket('idea-enrichment');
  if (error || !data) {
    console.error('bucket idea-enrichment NÃO encontrado:', error?.message);
    process.exit(1);
  }
  console.log('OK: bucket idea-enrichment presente, public =', data.public);
}

main();
