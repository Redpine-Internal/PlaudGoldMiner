import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  sql: string;
  params: unknown[];
}

const calls: Call[] = [];
const results: Array<{ rows: unknown[] }> = [];

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  return results.shift() ?? { rows: [] };
});

vi.mock('@/lib/db', () => ({ pool: { query } }));

const { GET } = await import('./route');

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
  query.mockClear();
});

describe('GET /api/dashboard', () => {
  it('mantém rótulos e números apoiados na mesma semântica dos dados', async () => {
    results.push(
      { rows: [{ count: 258 }] },
      { rows: [{ count: 42 }] },
      { rows: [{ count: 0 }] },
      { rows: [{ count: 19 }] },
      {
        rows: [{
          conversations: 1,
          opportunities: 7,
          source_conversations: 6,
          recent_source_conversations: 1,
          suggested_contents: 3,
          top_type: 'consultoria',
          top_type_count: 4,
        }],
      },
      {
        rows: [{
          id: 'plaud-file-1',
          title: 'Definição de indicadores',
          date: '2026-09-02',
        }],
      },
      { rows: [{ id: 'o1', title: 'Diagnóstico', status: 'nova', score: 81 }] },
      {
        rows: [{
          name: 'Cultura e liderança',
          rationale: 'O tema reúne decisões sobre comportamento seguro.',
          updated_at: '2026-09-01T12:00:00.000Z',
          opportunities: 8,
          conversations: 14,
        }],
      },
      { rows: [{ total: 42, mapped: 20, updated_at: '2026-09-01T12:00:00.000Z' }] },
      { rows: [] },
      { rows: [{ name: '   ' }] },
      {
        rows: [{
          type: 'consultoria',
          count: 19,
          conversations: 30,
          avg_score: 75,
          top_title: 'Programa executivo',
        }],
      },
      { rows: [{ month: '2026-09', total: 1 }] },
      {
        rows: [
          { sources: 0, opportunities: 2 },
          { sources: 1, opportunities: 5 },
        ],
      },
      { rows: [{ linked: 36, total: 258 }] },
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.greetingName).toBe('Fabio');
    expect(body.data.kpis).toEqual({ conversations: 258, opportunities: 42, contents: 19 });
    expect(body.data.queue.suggestedContents).toBe(19);
    expect(body.data.weekSummary).toBe(
      'Há 1 conversa no acervo com data nos últimos 7 dias. ' +
      'Nesse período, a IA registrou 7 novos negócios a partir de 6 conversas do acervo; 5 delas são anteriores a essa janela. ' +
      'Consultoria lidera as novas oportunidades, com 4 registros. ' +
      '3 conteúdos sugeridos aguardam revisão.'
    );
    expect(body.data.recentConversations[0]).toEqual({
      id: 'plaud-file-1',
      title: 'Definição de indicadores',
      date: '2026-09-02',
    });
    expect(body.data.themes).toEqual([
      {
        name: 'Cultura e liderança',
        rationale: 'O tema reúne decisões sobre comportamento seguro.',
        opportunities: 8,
        conversations: 14,
      },
    ]);
    expect(body.data.themeCoverage).toEqual({
      total: 42,
      mapped: 20,
      ungrouped: 22,
      percent: 48,
      updatedAt: '2026-09-01T12:00:00.000Z',
    });
    expect(body.data.demand[0]).toMatchObject({ conversations: 30, reach: 83 });
    expect(body.data.evidence).toMatchObject({ withoutSources: 2, single: 5, sourceLinks: 5 });
    expect(body.data.coverage).toEqual({ linked: 36, total: 258, percent: 14 });
    expect(body.data.lastProject).toBeNull();

    expect(calls[1].sql).toContain("status IS DISTINCT FROM 'descartada'");
    expect(calls[3].sql).toContain("status = 'sugerido'");
    expect(calls[4].sql).toContain("BETWEEN current_date - interval '6 days' AND current_date");
    expect(calls[5].sql).toContain("COALESCE(NULLIF(source_file_id, ''), id::text) AS id");
    expect(calls[5].sql).toContain("status = 'processado'");
    expect(calls[7].sql).toContain('FROM app_business_themes');
    expect(calls[8].sql).toContain('FROM active_opportunities');
    expect(calls[9].sql).toContain("WHERE status = 'ativo'");
    expect(calls[14].sql).toContain('INNER JOIN app_opportunities');
    expect(calls[14].sql).toContain('INNER JOIN conversations');
    expect(calls.filter((call) => call.sql.includes('FROM app_projects'))).toHaveLength(1);
  });
});
