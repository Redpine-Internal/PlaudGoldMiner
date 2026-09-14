import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

const { middleware } = await import('@/middleware');

beforeEach(() => getUser.mockReset());

describe('middleware de autenticação', () => {
  it('permite o callback OAuth antes de existir uma sessão', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    const response = await middleware(new NextRequest('https://app.example.com/auth/callback?code=ok'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('continua protegendo as demais páginas sem sessão', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    const response = await middleware(new NextRequest('https://app.example.com/conteudos'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/login');
  });

  it('permite as páginas para um dos dois usuários autorizados', async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'Fabio.Marques@ehsbrasil.com' } },
    });

    const response = await middleware(new NextRequest('https://app.example.com/conteudos'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('recusa uma sessão válida de qualquer outro usuário', async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { email: 'outro.usuario@ehsbrasil.com' } },
    });

    const response = await middleware(new NextRequest('https://app.example.com/conteudos'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/login?error=access');
  });
});
