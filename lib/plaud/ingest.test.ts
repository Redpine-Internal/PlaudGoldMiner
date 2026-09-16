import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('@/lib/db', () => ({ pool: { connect } }));
vi.mock('@/lib/plaud/client', () => ({ getFileContent: vi.fn() }));

const { ingestPlaudFile, stagePlaudFile, normalizePlaudFileId } = await import('@/lib/plaud/ingest');

const file = {
  id: 'plaud-1',
  name: 'Conversa de teste',
  created_at: '2026-09-08T12:00:00Z',
  start_at: '2026-09-08T12:00:00Z',
  duration: 120_000,
};

function clientWith(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>
) {
  return { query: vi.fn(query), release: vi.fn() };
}

beforeEach(() => {
  connect.mockReset();
});

describe('chave de idempotência do Plaud', () => {
  it('trata o id prefixado com of_ como a mesma gravação', () => {
    expect(normalizePlaudFileId('of_0008451f50a661c48b377fc50e9bf371')).toBe(
      '0008451f50a661c48b377fc50e9bf371',
    );
    expect(normalizePlaudFileId('0008451f50a661c48b377fc50e9bf371')).toBe(
      '0008451f50a661c48b377fc50e9bf371',
    );
  });

  it('remove apenas o prefixo inicial, preservando of_ no meio do id', () => {
    expect(normalizePlaudFileId('abcof_123')).toBe('abcof_123');
    expect(normalizePlaudFileId('of_of_123')).toBe('of_123');
  });

  it('reconhece a gravação já existente quando o Plaud passa a prefixar o id', async () => {
    const seen: unknown[][] = [];
    const client = clientWith(async (sql, params) => {
      if (params) seen.push(params as unknown[]);
      if (sql.includes('SELECT m.id')) {
        return {
          rows: [
            {
              id: 'meeting-existente',
              title: 'Conversa de teste',
              transcription: 'conteúdo já transcrito',
              meeting_date: '2026-09-08',
              duration: '120000',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    connect.mockResolvedValue(client);

    const result = await stagePlaudFile({ ...file, id: `of_${file.id}` });

    // Não pode criar uma segunda linha para a mesma gravação.
    expect(result.outcome).not.toBe('created');
    expect(result.meetingId).toBe('meeting-existente');
    // A busca precisa usar o id sem prefixo.
    expect(seen.some((p) => p.includes('plaud-1'))).toBe(true);
    expect(seen.some((p) => p.includes('of_plaud-1'))).toBe(false);
  });
});

describe('ingestão de gravações do Plaud', () => {
  it('cria um registro pendente mesmo quando só existem os metadados da gravação', async () => {
    const client = clientWith(async (sql) => {
      if (sql.includes('FROM meetings m')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO meetings')) return { rows: [{ id: 'meeting-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    connect.mockResolvedValue(client);

    const result = await stagePlaudFile(file);

    expect(result).toEqual({
      fileId: file.id,
      meetingId: 'meeting-1',
      outcome: 'created',
      reason: 'aguardando transcrição do Plaud',
      needsContent: true,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("VALUES ($1,'',0"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'type','nao_classificado'"))).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('mantém o placeholder e não chama IA quando o Plaud ainda não tem transcrição', async () => {
    const client = clientWith(async (sql) => {
      if (sql.includes('FROM meetings m')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO meetings')) return { rows: [{ id: 'meeting-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    connect.mockResolvedValue(client);

    const result = await ingestPlaudFile(file.id, {
      getFileContent: vi.fn().mockResolvedValue({
        file,
        transcript: '',
        summary: '',
        topics: [],
      }),
    });

    expect(result).toMatchObject({
      meetingId: 'meeting-1',
      outcome: 'created',
      reason: 'aguardando transcrição do Plaud',
    });
  });

  it('preenche e recoloca na fila de processamento um placeholder quando o texto fica pronto', async () => {
    const queries: string[] = [];
    const client = clientWith(async (sql) => {
      queries.push(sql);
      if (sql.includes("m.metadata->>'duration' AS duration")) {
        return {
          rows: [{
            id: 'meeting-1',
            title: file.name,
            transcription: '',
            meeting_date: '2026-09-08',
            duration: '120000',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('s.summary_text')) {
        return {
          rows: [{
            id: 'meeting-1',
            title: file.name,
            transcription: '',
            meeting_date: '2026-09-08',
            summary_text: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM summaries')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    connect.mockResolvedValue(client);

    const result = await ingestPlaudFile(file.id, {
      getFileContent: vi.fn().mockResolvedValue({
        file,
        transcript: 'Transcrição disponível.',
        summary: 'Resumo disponível.',
        topics: ['Segurança'],
      }),
    });

    expect(result).toMatchObject({ meetingId: 'meeting-1', outcome: 'updated' });
    expect(queries.some((sql) => sql.includes("THEN 'received'"))).toBe(true);
    expect(queries.some((sql) => sql.includes("'type', 'reuniao'"))).toBe(false);
    expect(queries.some((sql) => sql.includes('INSERT INTO summaries'))).toBe(true);
  });
});
