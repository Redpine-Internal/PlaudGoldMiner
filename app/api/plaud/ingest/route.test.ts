import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ runFullIngest: vi.fn() }));

vi.mock('@/lib/plaud/ingest-all', () => {
  class IngestAlreadyRunningError extends Error {}
  class IngestRunError extends Error {
    partial = {};
    cause: unknown;
  }
  return {
    runFullIngest: mocks.runFullIngest,
    IngestAlreadyRunningError,
    IngestRunError,
  };
});

const { POST } = await import('@/app/api/plaud/ingest/route');

function request(secret?: string) {
  return new NextRequest('http://localhost/api/plaud/ingest', {
    method: 'POST',
    headers: secret ? { 'x-ingest-secret': secret, 'x-ingest-trigger': 'cron' } : undefined,
    body: '{}',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INGEST_CRON_SECRET = 'segredo-de-teste';
  mocks.runFullIngest.mockResolvedValue({
    ingest: {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      awaitingTranscription: 0,
      errors: [],
    },
    processing: { processed: 0, failed: 0 },
  });
});

describe('POST /api/plaud/ingest', () => {
  it('falha de forma segura quando o segredo do agendamento não está configurado', async () => {
    delete process.env.INGEST_CRON_SECRET;

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.runFullIngest).not.toHaveBeenCalled();
  });

  it('recusa um segredo incorreto', async () => {
    const response = await POST(request('incorreto'));

    expect(response.status).toBe(401);
    expect(mocks.runFullIngest).not.toHaveBeenCalled();
  });

  it('executa a reconciliação automática com o segredo correto', async () => {
    const response = await POST(request('segredo-de-teste'));

    expect(response.status).toBe(200);
    expect(mocks.runFullIngest).toHaveBeenCalledWith('cron', undefined);
  });
});
