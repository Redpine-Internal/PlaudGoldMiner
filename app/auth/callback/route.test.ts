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

    expect(exchangeCodeForSession).toHaveBeenCalledWith('ok');
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
});
