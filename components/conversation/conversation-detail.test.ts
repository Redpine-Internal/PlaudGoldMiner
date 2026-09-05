import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchConversationResource } from '@/components/conversation/ConversationDetailView';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('carregamento do detalhe de conversa', () => {
  it('distingue conversa inexistente de falha de servidor', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Conversa não encontrada' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: 'Serviço indisponível' }, { status: 502 })));
    await expect(fetchConversationResource('/api/conversations/ausente')).rejects.toMatchObject({ status: 404 });
    await expect(fetchConversationResource('/api/conversations/existente')).rejects.toMatchObject({ status: 502 });
  });

  it('interrompe uma resposta travada para que o carregamento não fique infinito', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const loading = expect(fetchConversationResource('/api/conversations/lenta')).rejects.toThrow('demorou mais que o esperado');
    await vi.advanceTimersByTimeAsync(30_000);
    await loading;
  });

  it('remove o temporizador após uma resposta normal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { id: 'conversa' } })));
    await expect(fetchConversationResource('/api/conversations/conversa')).resolves.toEqual({ data: { id: 'conversa' } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
