import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/plaud/tokens', () => ({
  getAccessToken: async () => 'test-token',
  PlaudAuthError: class PlaudAuthError extends Error {},
  PLAUD_AUTH_CLIENT_MESSAGE: 'Reconecte o Plaud.',
}));
vi.mock('@/lib/ai/conversation-analysis-store', () => ({
  getConversationAiAnalysisByPlaudFileId: async () => null,
}));
import { getFile, PlaudApiError } from '@/lib/plaud/client';
import { GET } from '@/app/api/plaud/files/[id]/route';

const id = '00000000000000000000000000000001';
const detail = () => GET(new Request(`http://localhost/api/plaud/files/${id}`), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('erros HTTP no detalhe Plaud', () => {
  it('preserva o status na classe de erro do cliente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
    const missing = getFile(id);
    await expect(missing).rejects.toBeInstanceOf(PlaudApiError);
    await expect(missing).rejects.toMatchObject({ status: 404 });
  });

  it('mostra gravação inexistente quando o Plaud responde 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
    const response = await detail();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Gravação não encontrada no Plaud.' });
  });

  it('preserva o tratamento de autenticação existente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    const response = await detail();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Reconecte o Plaud.', code: 'plaud_auth' });
  });

  it.each([429, 500])('mantém falha do serviço para HTTP %s, sem confundir com ausência', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status })));
    const response = await detail();
    expect(response.status).toBe(502);
  });

  it('mantém o contrato de um detalhe bem-sucedido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id, name: 'Conversa de teste', start_at: '2026-09-02T12:00:00Z', duration: 120000 })));
    const response = await detail();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id, title: 'Conversa de teste', date: '2026-09-02', duration: '2min', source: 'plaud' } });
  });
});
