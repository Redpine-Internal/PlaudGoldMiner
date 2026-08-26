import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pool } from '@/lib/db';
import { saveTokenSet } from '@/lib/plaud/token-store';

const TOKEN_FILE = process.env.PLAUD_TOKEN_FILE || join(homedir(), '.plaud', 'tokens-mcp.json');

async function main() {
  const raw = await readFile(TOKEN_FILE, 'utf8');
  const t = JSON.parse(raw) as { access_token?: string; refresh_token?: string; token_type?: string; expires_at?: number };
  if (!t.refresh_token) throw new Error(`Sem refresh_token em ${TOKEN_FILE}. Rode o login do MCP do Plaud primeiro.`);
  await saveTokenSet({
    accessToken: t.access_token ?? '',
    refreshToken: t.refresh_token,
    tokenType: t.token_type ?? 'Bearer',
    expiresAt: t.expires_at ? new Date(t.expires_at) : null,
  });
  // Não imprimir tokens — só confirmação.
  console.log('app_plaud_tokens semeado a partir de', TOKEN_FILE);
  await pool.end();
}
main().catch(async (e) => { console.error('SEED FALHOU:', e.message); try { await pool.end(); } catch {} process.exit(1); });
