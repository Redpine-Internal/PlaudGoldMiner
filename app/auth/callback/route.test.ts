import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession, getUser, signOut },
  })),
}));

const { GET } = await import('@/app/auth/callback/route');

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  getUser.mockReset();
  signOut.mockReset();
});

describe('GET /auth/callback', () => {
  it('troca o código pela sessão e volta à página solicitada', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
    });

    const response = await GET(new NextRequest('https://app.example.com/auth/callback?code=ok&next=%2Fconteudos'));

    expect(exchangeCodeForSession).toHaveBeenCalledWith('ok', undefined);
    expect(response.headers.get('location')).toBe('https://app.example.com/conteudos');
  });

  it('identifica consentimento negado pelo Entra ID sem trocar código', async () => {
    const response = await GET(
      new NextRequest(
        'https://app.example.com/auth/callback?error=access_denied&error_description=AADSTS65001',
      ),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=consent');
  });

  it('trata outros erros do provedor como falha genérica de SSO', async () => {
    const response = await GET(
      new NextRequest('https://app.example.com/auth/callback?error=server_error'),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=sso');
  });

  it('impede redirecionamento para outro domínio', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'andreza.araujo@ehsbrasil.com' } },
    });

    const response = await GET(new NextRequest('https://app.example.com/auth/callback?code=ok&next=%2F%2Fevil.example'));

    expect(response.headers.get('location')).toBe('https://app.example.com/');
  });

  it('usa o domínio público encaminhado pelo Cloud Run', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
    });

    const request = new NextRequest(
      'http://0.0.0.0:8080/auth/callback?code=ok&next=%2Fconteudos',
      {
        headers: {
          'x-forwarded-host': 'plaudgoldminer-huzboo2prq-uc.a.run.app',
          'x-forwarded-proto': 'https',
        },
      },
    );

    const response = await GET(request);

    expect(response.headers.get('location')).toBe(
      'https://plaudgoldminer-huzboo2prq-uc.a.run.app/conteudos',
    );
  });

  it('volta ao login quando a troca do código falha', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('invalid code') });

    const response = await GET(new NextRequest('https://app.example.com/auth/callback?code=bad'));

    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=sso');
  });

  it('encerra a sessão quando a conta Microsoft não está autorizada', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'outro.usuario@ehsbrasil.com' } },
    });
    signOut.mockResolvedValueOnce({ error: null });

    const response = await GET(new NextRequest('https://app.example.com/auth/callback?code=ok'));

    expect(signOut).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=access');
  });

  it('repassa o sb_flow_id para localizar o code_verifier do fluxo em curso', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
    });

    const flowId = '0123456789abcdef0123456789abcdef';
    const response = await GET(
      new NextRequest(
        `https://app.example.com/auth/callback?code=ok&sb_flow_id=${flowId}`,
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('ok', { flowId });
    expect(response.headers.get('location')).toBe('https://app.example.com/');
  });

  it('ignora sb_flow_id com formato inválido em vez de repassá-lo', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
    });

    await GET(
      new NextRequest(
        'https://app.example.com/auth/callback?code=ok&sb_flow_id=../../etc/passwd',
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('ok', undefined);
  });

  it('aceita as demais formas de flow id que o auth-js considera válidas', async () => {
    // O gerador produz 32 hexadecimais hoje, mas validatePKCEFlowId aceita
    // [a-zA-Z0-9_-]{8,64}. Casar com o gerador quebraria o login se o formato
    // mudasse no pacote.
    for (const flowId of ['abc-DEF_123', 'a'.repeat(64), '12345678']) {
      exchangeCodeForSession.mockReset();
      getUser.mockReset();
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      await GET(
        new NextRequest(`https://app.example.com/auth/callback?code=ok&sb_flow_id=${flowId}`),
      );

      expect(exchangeCodeForSession).toHaveBeenCalledWith('ok', { flowId });
    }
  });

  it('descarta flow id curto ou longo demais para o padrão do auth-js', async () => {
    for (const flowId of ['curto', 'x'.repeat(65)]) {
      exchangeCodeForSession.mockReset();
      getUser.mockReset();
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      await GET(
        new NextRequest(`https://app.example.com/auth/callback?code=ok&sb_flow_id=${flowId}`),
      );

      expect(exchangeCodeForSession).toHaveBeenCalledWith('ok', undefined);
    }
  });

  it('nega acesso a e-mail fora da allowlist mesmo com sb_flow_id válido', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'intruso@outrodominio.com' } },
    });
    signOut.mockResolvedValueOnce({ error: null });

    const response = await GET(
      new NextRequest(
        'https://app.example.com/auth/callback?code=ok&sb_flow_id=0123456789abcdef0123456789abcdef',
      ),
    );

    expect(signOut).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe(
      'https://app.example.com/login?error=access',
    );
  });

  it('preserva o destino solicitado junto com o sb_flow_id', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'andreza.araujo@ehsbrasil.com' } },
    });

    const response = await GET(
      new NextRequest(
        'https://app.example.com/auth/callback?code=ok&next=%2Fconteudos&sb_flow_id=0123456789abcdef0123456789abcdef',
      ),
    );

    expect(response.headers.get('location')).toBe(
      'https://app.example.com/conteudos',
    );
  });

  it('volta ao login quando o verifier do fluxo não está no cookie', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      error: new Error('code verifier should be non-empty'),
    });

    const response = await GET(
      new NextRequest(
        'https://app.example.com/auth/callback?code=ok&sb_flow_id=0123456789abcdef0123456789abcdef',
      ),
    );

    expect(response.headers.get('location')).toBe(
      'https://app.example.com/login?error=sso',
    );
  });

  // Órfãos de code verifier engordam o header Cookie até o teto de 16KB do
  // Node, que responde 431 antes da aplicação rodar — tela branca depois de um
  // login que deu certo. O callback é o único ponto onde se sabe que nenhum
  // fluxo PKCE legítimo está pendente.
  describe('limpeza dos cookies de code verifier', () => {
    const STORAGE_KEY = 'sb-abcdefghijklmnop-auth-token';

    function requestWithCookies(url: string, cookies: Record<string, string>) {
      const request = new NextRequest(url);
      for (const [name, value] of Object.entries(cookies)) {
        request.cookies.set(name, value);
      }
      return request;
    }

    function expiredCookieNames(response: Response) {
      return response.headers
        .getSetCookie()
        .filter((cookie) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cookie))
        .map((cookie) => cookie.split('=')[0]);
    }

    it('apaga os verifiers órfãos após um login bem-sucedido', async () => {
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=ok', {
          [`${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`]: 'v1',
          [`${STORAGE_KEY}-flow-fedcba9876543210fedcba9876543210-code-verifier`]: 'v2',
          [`${STORAGE_KEY}-code-verifier`]: 'legado',
          [`${STORAGE_KEY}-flows-code-verifier`]: '["0123456789abcdef0123456789abcdef"]',
        }),
      );

      expect(expiredCookieNames(response).sort()).toEqual(
        [
          `${STORAGE_KEY}-code-verifier`,
          `${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`,
          `${STORAGE_KEY}-flow-fedcba9876543210fedcba9876543210-code-verifier`,
          `${STORAGE_KEY}-flows-code-verifier`,
        ].sort(),
      );
    });

    it('não expira o cookie de sessão de quem acabou de entrar', async () => {
      // A regressão que importa: varrer demais deslogaria no próximo request.
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=ok', {
          [`${STORAGE_KEY}.0`]: 'sessao-parte-1',
          [`${STORAGE_KEY}.1`]: 'sessao-parte-2',
          [`${STORAGE_KEY}-code-verifier`]: 'lixo',
        }),
      );

      const expirados = expiredCookieNames(response);
      expect(expirados).toContain(`${STORAGE_KEY}-code-verifier`);
      expect(expirados).not.toContain(`${STORAGE_KEY}.0`);
      expect(expirados).not.toContain(`${STORAGE_KEY}.1`);
    });

    it('apaga os verifiers também quando a troca do código falha', async () => {
      // Sem isto o header nunca encolhe no caso que mais acumula órfãos:
      // tentativas seguidas que não completam.
      exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('invalid code') });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=bad', {
          [`${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`]: 'v1',
        }),
      );

      expect(expiredCookieNames(response)).toEqual([
        `${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`,
      ]);
    });

    it('apaga os verifiers quando o provedor recusa antes de emitir o código', async () => {
      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?error=access_denied', {
          [`${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`]: 'v1',
        }),
      );

      expect(expiredCookieNames(response)).toEqual([
        `${STORAGE_KEY}-flow-0123456789abcdef0123456789abcdef-code-verifier`,
      ]);
    });

    it('apaga os verifiers quando a conta não está autorizada', async () => {
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'intruso@outrodominio.com' } },
      });
      signOut.mockResolvedValueOnce({ error: null });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=ok', {
          [`${STORAGE_KEY}-code-verifier`]: 'lixo',
        }),
      );

      expect(expiredCookieNames(response)).toContain(`${STORAGE_KEY}-code-verifier`);
    });

    it('expira no path em que o cookie foi escrito', async () => {
      // Path diferente do da escrita cria outro cookie e deixa o original vivo.
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=ok', {
          [`${STORAGE_KEY}-code-verifier`]: 'lixo',
        }),
      );

      const cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${STORAGE_KEY}-code-verifier=`));
      expect(cookie).toMatch(/Path=\//i);
    });

    it('não mexe em cookies quando não há verifier algum', async () => {
      exchangeCodeForSession.mockResolvedValueOnce({ error: null });
      getUser.mockResolvedValueOnce({
        data: { user: { email: 'fabio.marques@ehsbrasil.com' } },
      });

      const response = await GET(
        requestWithCookies('https://app.example.com/auth/callback?code=ok', {
          theme: 'dark',
        }),
      );

      expect(expiredCookieNames(response)).toEqual([]);
    });
  });
});
