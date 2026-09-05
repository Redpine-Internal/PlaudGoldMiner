import dotenv from 'dotenv';
import pg from 'pg';

// Somente a estrutura do acervo é espelhada. Nunca apontar testes de escrita
// para as URLs de banco carregadas do ambiente normal da aplicação.
export const QA_DATABASE_URL = 'postgresql://pgm_qa@127.0.0.1:55432/pgm_qa?sslmode=disable';

export async function configureQaEnvironment() {
  dotenv.config({ quiet: true });
  process.env.MEETINGS_DATABASE_URL = QA_DATABASE_URL;
  process.env.DATABASE_URL = QA_DATABASE_URL;
  process.env.PLAUD_API_BASE = 'http://127.0.0.1:1';
  process.env.PLAUD_REFRESH_URL = 'http://127.0.0.1:1';
  process.env.PLAUD_REFRESH_TOKEN = '';
  process.env.PLAUD_TOKEN_FILE = '/private/tmp/pgm-qa-no-real-plaud-token.json';
  process.env.N8N_BASE_URL = 'http://127.0.0.1:1';
  process.env.N8N_WEBHOOK_SECRET = '';
  // Sem escrita no Storage real nesta fase. A autenticação Supabase e a IA
  // continuam reais, mas dados de negócio são exclusivamente os do PostgreSQL local.
  process.env.SUPABASE_URL_SISTEMA = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY_SISTEMA = '';
  process.env.AUTH_URL = 'http://localhost:3100';
  const client = new pg.Client({ connectionString: QA_DATABASE_URL });
  await client.connect();
  try {
    const { rows: [identity] } = await client.query('SELECT current_database() AS db, current_user AS username, inet_server_addr()::text AS host, inet_server_port() AS port');
    if (identity.db !== 'pgm_qa' || identity.username !== 'pgm_qa' || identity.host !== '127.0.0.1/32' && identity.host !== '127.0.0.1' || identity.port !== 55432) {
      throw new Error('QA interrompido: identidade do banco não corresponde à base local isolada.');
    }
  } finally { await client.end(); }
}
