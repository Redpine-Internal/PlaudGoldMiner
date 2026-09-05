import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloneStream, regenerationHistory, replaceCloneReply, type CloneMessage } from '@/lib/clone/chat-stream';

const history: CloneMessage[] = [
  { id: 'greeting', role: 'clone', text: 'Olá' },
  { id: 'question-1', role: 'user', text: 'Primeira pergunta' },
  { id: 'answer-1', role: 'clone', text: 'Primeira resposta', useful: true },
  { id: 'question-2', role: 'user', text: 'Segunda pergunta' },
  { id: 'answer-2', role: 'clone', text: 'Segunda resposta' },
];

afterEach(() => vi.unstubAllGlobals());

describe('Clone reply routing', () => {
  it('updates only the intended answer, preserving later questions and answers', () => {
    const next = replaceCloneReply(history, 'answer-1', 'Resposta nova');
    expect(next.map((message) => message.id)).toEqual(history.map((message) => message.id));
    expect(next[2]).toEqual({ ...history[2], text: 'Resposta nova', useful: false });
    expect(next[3]).toBe(history[3]);
    expect(next[4]).toBe(history[4]);
    expect(history[2].text).toBe('Primeira resposta');
  });

  it('regenerates from the original question without the answer or later turns', () => {
    expect(regenerationHistory(history, 'answer-1')).toEqual([
      { role: 'clone', text: 'Olá' },
      { role: 'user', text: 'Primeira pergunta' },
    ]);
    expect(regenerationHistory(history, 'greeting')).toBeNull();
    expect(regenerationHistory(history, 'unknown')).toBeNull();
  });
});

describe('Clone stream lifecycle', () => {
  it('keeps the lock after the first token and rejects concurrent sends until the stream ends', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetchMock);
    const stream = createCloneStream();
    const onText = vi.fn();
    const run = stream.run(history.slice(0, 2), onText);
    expect(stream.pending).toBe(true);
    controller.enqueue(new TextEncoder().encode('Primeiro token'));
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('Primeiro token'));
    expect(stream.pending).toBe(true);
    expect(await stream.run(history, vi.fn())).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.close();
    expect(await run).toBe(true);
    expect(stream.pending).toBe(false);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toEqual([{ role: 'clone', text: 'Olá' }, { role: 'user', text: 'Primeira pergunta' }]);
  });

  it('preserves accented text split across byte chunks', async () => {
    const bytes = new TextEncoder().encode('Ação útil');
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const onText = vi.fn();
    await createCloneStream().run(history, onText);
    expect(onText).toHaveBeenLastCalledWith('Ação útil');
  });

  it('releases the lock after an HTTP failure so the question can be retried', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Indisponível' }, { status: 503 }))
      .mockResolvedValueOnce(new Response('Pronto')));
    const stream = createCloneStream();
    await expect(stream.run(history, vi.fn())).rejects.toThrow('Indisponível');
    expect(stream.pending).toBe(false);
    const onText = vi.fn();
    expect(await stream.run(history, onText)).toBe(true);
    expect(onText).toHaveBeenLastCalledWith('Pronto');
  });

  it('treats an empty response as failure instead of a successful blank answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
    const stream = createCloneStream();
    await expect(stream.run(history, vi.fn())).rejects.toThrow();
    expect(stream.pending).toBe(false);
  });

  it('aborts the request when leaving the chat and prevents further updates', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetchMock);
    const stream = createCloneStream();
    const onText = vi.fn();
    const run = stream.run(history, onText);
    const rejection = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    stream.cancel();
    controller.enqueue(new TextEncoder().encode('Não exibir'));
    controller.close();
    await rejection;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(onText).not.toHaveBeenCalled();
    expect(stream.pending).toBe(false);
  });
});
