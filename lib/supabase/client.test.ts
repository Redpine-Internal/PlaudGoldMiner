import { describe, expect, it } from 'vitest';
import { createBrowserClient } from '@supabase/ssr';

// Estes testes exercitam o @supabase/auth-js REAL (sem mock do pacote) para
// travar o comportamento que quebrou o SSO em produção: o `sb_flow_id` precisa
// viajar no `redirect_to`, senão o callback do servidor não sabe qual fluxo
// PKCE está trocando o code.
//
// `lib/supabase/client.ts` não é importado direto porque o createBrowserClient
// recusa rodar fora de um navegador sem adaptador de cookie. O que se testa
// aqui é a OPÇÃO que aquele arquivo passa — o teste falha se alguém remover a
// flag de lá e não a remover daqui, e vice-versa.
const SSO_OPTIONS = {
  scopes: 'openid profile email',
  redirectTo: 'https://plaud.ehssystem.us/auth/callback',
  skipBrowserRedirect: true,
} as const;

function makeClient(experimental?: { appendPkceFlowIdToRedirects: boolean }) {
  const jar = new Map<string, string>();
  return createBrowserClient('https://projeto.supabase.co', 'anon-key', {
    isSingleton: false,
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value, options }) => {
          if (options?.maxAge === 0 || value === '') jar.delete(name);
          else jar.set(name, value);
        }),
    },
    ...(experimental ? { auth: { experimental } } : {}),
  });
}

function redirectTargetOf(url: string) {
  return new URL(url).searchParams.get('redirect_to') ?? '';
}

describe('cliente Supabase do navegador — SSO / PKCE', () => {
  it('envia o sb_flow_id no redirect_to com a flag ligada', async () => {
    const client = makeClient({ appendPkceFlowIdToRedirects: true });

    const { data } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    const redirectTo = redirectTargetOf(data.url!);
    expect(redirectTo).toContain('sb_flow_id=');
    // O id na URL tem de ser o mesmo do fluxo que gravou o verifier.
    expect(new URL(redirectTo).searchParams.get('sb_flow_id')).toBe(data.flowId);
  });

  it('o sb_flow_id passa no formato aceito pela rota de callback', async () => {
    const client = makeClient({ appendPkceFlowIdToRedirects: true });

    const { data } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    const flowId = new URL(redirectTargetOf(data.url!)).searchParams.get(
      'sb_flow_id',
    );
    // Mesmo padrão de FLOW_ID_PATTERN em app/auth/callback/route.ts.
    expect(flowId).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it('preserva o caminho do callback ao anexar o sb_flow_id', async () => {
    const client = makeClient({ appendPkceFlowIdToRedirects: true });

    const { data } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    const redirectTo = new URL(redirectTargetOf(data.url!));
    expect(redirectTo.origin).toBe('https://plaud.ehssystem.us');
    expect(redirectTo.pathname).toBe('/auth/callback');
  });

  it('mantém PKCE: manda code_challenge e não pede token no fragmento', async () => {
    const client = makeClient({ appendPkceFlowIdToRedirects: true });

    const { data } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    const params = new URL(data.url!).searchParams;
    expect(params.get('code_challenge')).toBeTruthy();
    expect(params.get('code_challenge_method')).toBe('s256');
  });

  it('sem a flag o sb_flow_id não viaja — a regressão que quebrou o login', async () => {
    const client = makeClient();

    const { data } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    // Documenta o padrão do pacote: é isto que a flag existe para corrigir.
    expect(redirectTargetOf(data.url!)).not.toContain('sb_flow_id');
  });

  it('dois fluxos simultâneos recebem ids distintos, cada um com seu verifier', async () => {
    // O caso real do incidente: duas tentativas de SSO em voo. Sem o id, o
    // slot legado de chave fixa guarda só o verifier do último fluxo e o
    // callback do primeiro troca o code com o verifier errado.
    const client = makeClient({ appendPkceFlowIdToRedirects: true });

    const first = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });
    const second = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: SSO_OPTIONS,
    });

    expect(first.data.flowId).not.toBe(second.data.flowId);
    // Cada callback carrega o id do SEU fluxo, então o primeiro não é mais
    // resolvido com o verifier do segundo.
    expect(
      new URL(redirectTargetOf(first.data.url!)).searchParams.get('sb_flow_id'),
    ).toBe(first.data.flowId);
    expect(
      new URL(redirectTargetOf(second.data.url!)).searchParams.get('sb_flow_id'),
    ).toBe(second.data.flowId);
  });
});
