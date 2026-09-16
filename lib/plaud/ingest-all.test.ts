import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  ingestPlaudFile: vi.fn(),
  stagePlaudFile: vi.fn(),
  processPendingConversations: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('@/lib/plaud/client', () => ({ listFiles: mocks.listFiles }));
vi.mock('@/lib/plaud/ingest', () => ({
  ingestPlaudFile: mocks.ingestPlaudFile,
  stagePlaudFile: mocks.stagePlaudFile,
}));
vi.mock('@/lib/plaud/process-pending', () => ({
  processPendingConversations: mocks.processPendingConversations,
}));
vi.mock('@/lib/plaud/run-log', () => ({
  startIngestRun: mocks.startIngestRun,
  finishIngestRun: mocks.finishIngestRun,
}));
vi.mock('@/lib/db', () => ({ pool: { connect: mocks.connect } }));
vi.mock('@/lib/plaud/tokens', () => ({ PlaudAuthError: class PlaudAuthError extends Error {} }));

const { IngestAlreadyRunningError, runFullIngest } = await import('@/lib/plaud/ingest-all');

const file = (id: string) => ({
  id,
  name: `Conversa ${id}`,
  created_at: '2026-09-08T12:00:00Z',
  start_at: '2026-09-08T12:00:00Z',
  duration: 120_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLAUD_INGEST_MIN_INTERVAL_MS = '0';
  mocks.connect.mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }),
    release: vi.fn(),
  });
  mocks.startIngestRun.mockResolvedValue('run-1');
  mocks.finishIngestRun.mockResolvedValue(undefined);
  mocks.processPendingConversations.mockResolvedValue({ processed: 0, failed: 0 });
});

describe('guarda-corpo de criação em massa', () => {
  it('aborta quando quase tudo que foi listado seria criado como novo', async () => {
    // Cenário do incidente de 16/09/2026: o Plaud prefixou os ids com 'of_',
    // a chave parou de casar e a varredura recriou o acervo inteiro.
    const ids = Array.from({ length: 40 }, (_, i) => `of_file-${i}`);
    mocks.listFiles.mockResolvedValue({ data: ids.map(file), page: 1, page_size: 50 });
    mocks.stagePlaudFile.mockImplementation(async (f: { id: string }) => ({
      fileId: f.id, meetingId: `m-${f.id}`, outcome: 'created', needsContent: true,
    }));

    await expect(runFullIngest('cron')).rejects.toThrow(/idempotência/i);
    // O corte acontece antes de gastar chamadas de detalhe no Plaud.
    expect(mocks.ingestPlaudFile).not.toHaveBeenCalled();
  });

  it('não interfere numa reconciliação normal, em que quase tudo já existe', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `file-${i}`);
    mocks.listFiles.mockResolvedValue({ data: ids.map(file), page: 1, page_size: 50 });
    mocks.stagePlaudFile.mockImplementation(async (f: { id: string }) => ({
      fileId: f.id, meetingId: `m-${f.id}`, outcome: 'skipped', needsContent: false,
    }));

    const result = await runFullIngest('cron');
    expect(result.ingest.created).toBe(0);
    expect(result.ingest.skipped).toBe(40);
  });

  it('permite a primeira carga, quando o acervo ainda é pequeno', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `file-${i}`);
    mocks.listFiles.mockResolvedValue({ data: ids.map(file), page: 1, page_size: 50 });
    mocks.stagePlaudFile.mockImplementation(async (f: { id: string }) => ({
      fileId: f.id, meetingId: `m-${f.id}`, outcome: 'created', needsContent: false,
    }));

    const result = await runFullIngest('manual');
    expect(result.ingest.created).toBe(12);
  });
});

describe('runFullIngest', () => {
  it('consulta detalhes apenas dos registros sem transcrição e reporta os pendentes', async () => {
    mocks.listFiles.mockResolvedValue({ data: [file('ready'), file('pending')], page: 1, page_size: 50 });
    mocks.stagePlaudFile
      .mockResolvedValueOnce({
        fileId: 'ready', meetingId: 'meeting-ready', outcome: 'skipped', needsContent: false,
      })
      .mockResolvedValueOnce({
        fileId: 'pending', meetingId: 'meeting-pending', outcome: 'created',
        reason: 'aguardando transcrição do Plaud', needsContent: true,
      });
    mocks.ingestPlaudFile.mockResolvedValue({
      fileId: 'pending', meetingId: 'meeting-pending', outcome: 'skipped',
      reason: 'aguardando transcrição do Plaud',
    });

    const result = await runFullIngest('manual');

    expect(mocks.ingestPlaudFile).toHaveBeenCalledOnce();
    expect(mocks.ingestPlaudFile).toHaveBeenCalledWith('pending');
    expect(result.ingest).toMatchObject({
      total: 2,
      created: 1,
      updated: 0,
      skipped: 1,
      awaitingTranscription: 1,
      errors: [],
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ ok: true }));
  });

  it('impede duas varreduras completas ao mesmo tempo', async () => {
    const release = vi.fn();
    mocks.connect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ locked: false }] }),
      release,
    });

    await expect(runFullIngest('cron')).rejects.toBeInstanceOf(IngestAlreadyRunningError);

    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});
