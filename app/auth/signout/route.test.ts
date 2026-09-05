import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut } }) }));
import { POST } from '@/app/auth/signout/route';

const request = () => new NextRequest('http://localhost/auth/signout', { method: 'POST' });
beforeEach(() => { signOut.mockReset(); });

describe('encerramento da sessão', () => {
  it('redireciona ao login após o serviço confirmar o logout', async () => {
    signOut.mockResolvedValue({ error: null });
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('não trata erro retornado pelo serviço como logout bem-sucedido', async () => {
    signOut.mockResolvedValue({ error: { message: 'Auth service unavailable' } });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.json()).toEqual({ error: 'Não foi possível encerrar sua sessão. Tente novamente.' });
  });

  it('devolve erro recuperável quando a chamada de logout falha', async () => {
    signOut.mockRejectedValue(new Error('Network error'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('location')).toBeNull();
  });
});
