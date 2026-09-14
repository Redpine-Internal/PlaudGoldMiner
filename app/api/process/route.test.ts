import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { rows, processTranscription, persistTranscriptionResult, update } = vi.hoisted(() => ({
  rows: [] as unknown[][],
  processTranscription: vi.fn(),
  persistTranscriptionResult: vi.fn(),
  update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows.shift() ?? [] }),
      }),
    }),
    update,
  },
}));
vi.mock('@/lib/ai/services/transcription-processor', () => ({ processTranscription }));
vi.mock('@/lib/ai/persist-result', () => ({
  persistTranscriptionResult,
  markConversationError: vi.fn(),
}));

const { POST } = await import('./route');
const conversationId = '11111111-1111-4111-8111-111111111111';
const request = () => new NextRequest('http://localhost/api/process', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ conversationId }),
});

beforeEach(() => {
  rows.length = 0;
  processTranscription.mockReset();
  persistTranscriptionResult.mockReset();
  update.mockClear();
});

describe('POST /api/process e classificação', () => {
  it('não consome IA para treinamento', async () => {
    rows.push([{ id: conversationId, type: 'treinamento', transcription: 'Conteúdo conhecido' }]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(processTranscription).not.toHaveBeenCalled();
    expect(persistTranscriptionResult).not.toHaveBeenCalled();
  });

  it('permite reunião interna', async () => {
    const conversation = {
      id: conversationId,
      title: 'Reunião interna',
      type: 'reuniao_interna',
      transcription: 'Discussão estratégica interna',
    };
    rows.push([conversation]);
    processTranscription.mockResolvedValue({ success: true, data: { problems: [] } });
    persistTranscriptionResult.mockResolvedValue({ conversation, opportunities: [] });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(processTranscription).toHaveBeenCalledWith(conversation.transcription);
    expect(persistTranscriptionResult).toHaveBeenCalled();
  });
});
