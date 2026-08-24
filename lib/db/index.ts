import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Supabase Postgres (rxugnepuvdhsmibakyij) — banco único da app + n8n.
// A app fala com o cloud através deste pool; a antiga camada libSQL/Turso
// (local.db) foi aposentada. `conversations` no cloud é uma VIEW sobre
// `meetings` com triggers INSTEAD OF, então as rotas seguem inalteradas.
const connectionString =
  process.env.MEETINGS_DATABASE_URL || process.env.DATABASE_URL || '';

// Pool singleton (evita esgotar conexões em dev com hot-reload).
const globalForDb = globalThis as unknown as { __meetingsPool?: Pool };

export const pool =
  globalForDb.__meetingsPool ??
  new Pool({
    connectionString,
    // Supabase exige TLS; o cert é da cadeia Supabase, não local.
    ssl: connectionString ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__meetingsPool = pool;
}

export const db = drizzle(pool, { schema });

// Re-export schema for convenience
export * from './schema';
