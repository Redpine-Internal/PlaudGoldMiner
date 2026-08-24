// Plaud token manager.
//
// Reuses the OAuth tokens the official @plaud-ai/mcp client already obtained and
// stored at ~/.plaud/tokens-mcp.json — so the app talks to the real Plaud API
// without a separate OAuth registration. Refreshes automatically when expired,
// mirroring the MCP client's refresh contract exactly:
//   POST /developer/api/oauth/third-party/access-token/refresh
//   Content-Type: application/x-www-form-urlencoded
//   body: refresh_token=<token>
//   -> { access_token, refresh_token?, token_type, expires_in }
//
// NOTE: this is a dev/local convenience. In production the app would carry its own
// registered OAuth credentials instead of reading the MCP token file.

import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN_FILE = process.env.PLAUD_TOKEN_FILE || join(homedir(), '.plaud', 'tokens-mcp.json');
const REFRESH_URL =
  process.env.PLAUD_REFRESH_URL ||
  'https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh';

// Refresh a bit before the real expiry, like the MCP client (60s skew).
const EXPIRY_SKEW_MS = 60_000;

interface TokenSet {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_at?: number; // epoch ms
}

let cache: TokenSet | null = null;

async function readTokenFile(): Promise<TokenSet> {
  if (cache) return cache;
  try {
    const raw = await readFile(TOKEN_FILE, 'utf8');
    cache = JSON.parse(raw) as TokenSet;
    return cache;
  } catch (e) {
    throw new PlaudAuthError(
      `Não foi possível ler os tokens do Plaud em ${TOKEN_FILE}. ` +
        `Autentique o MCP do Plaud primeiro (a conta andreza.araujo@ehsbrasil.com).`,
      e
    );
  }
}

async function saveTokenFile(next: TokenSet): Promise<void> {
  cache = next;
  try {
    await writeFile(TOKEN_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // Non-fatal: we still hold the fresh token in memory for this process.
  }
}

async function refresh(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new PlaudAuthError(`Falha ao renovar o token do Plaud (${res.status}). ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  const next: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    token_type: data.token_type ?? 'Bearer',
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  await saveTokenFile(next);
  return next;
}

/** Returns a valid access token, refreshing if it is expired or about to expire. */
export async function getAccessToken(): Promise<string> {
  let tokenSet = await readTokenFile();
  if (tokenSet.expires_at && Date.now() > tokenSet.expires_at - EXPIRY_SKEW_MS) {
    if (!tokenSet.refresh_token) {
      throw new PlaudAuthError('Token do Plaud expirado e sem refresh_token. Reautentique o MCP do Plaud.');
    }
    tokenSet = await refresh(tokenSet.refresh_token);
  }
  if (!tokenSet.access_token) {
    throw new PlaudAuthError('Token do Plaud ausente. Reautentique o MCP do Plaud.');
  }
  return tokenSet.access_token;
}

export class PlaudAuthError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PlaudAuthError';
    this.cause = cause;
  }
}

// Mensagem de 401 exposta ao cliente. Genérica DE PROPÓSITO: o `message` do
// PlaudAuthError carrega o caminho do arquivo de token (~/.plaud/...) e o e-mail
// da conta operadora — detalhes que não podem vazar para o cliente. O detalhe
// real continua disponível no servidor (cada rota faz console.error do erro cru).
// O `code` estável ('plaud_auth') é o que a UI usa para reagir.
export const PLAUD_AUTH_CLIENT_MESSAGE =
  'Autenticação com o Plaud falhou. Reautentique o MCP do Plaud.';
