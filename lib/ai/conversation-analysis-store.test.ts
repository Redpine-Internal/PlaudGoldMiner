import { beforeEach, describe, expect, it, vi } from 'vitest';

const results: Array<{ rows: unknown[]; rowCount?: number }> = [];
const query = vi.fn(async (_sql: string, params: unknown[] = []) => {
  void params;
  return results.shift() ?? { rows: [], rowCount: 0 };
});

vi.mock('@/lib/db', () => ({ pool: { query } }));

const {
  createConversationAiAnalysis,
  getConversationAiAnalysisByPlaudFileId,
  saveConversationAiAnalysis,
} = await import('./conversation-analysis-store');

const aiResult = {
  summary: 'Análise independente da aplicação',
  topics: ['Indicadores', 'Segurança'],
  participants: ['Fabio'],
  opportunities: [],
  problems: [{ description: 'Indicadores dispersos', mentions: 2, severity: 'alta' as const }],
  suggestedTitle: 'Definição de indicadores',
  suggestedType: 'reuniao' as const,
};

beforeEach(() => {
  results.length = 0;
  query.mockClear();
});

describe('conversation-analysis-store', () => {
  it('monta uma análise persistível sem misturar oportunidades relacionais', () => {
    const analysis = createConversationAiAnalysis(aiResult, new Date('2026-09-03T12:00:00Z'));

    expect(analysis).toEqual({
      version: 1,
      summary: aiResult.summary,
      topics: aiResult.topics,
      participants: aiResult.participants,
      problems: aiResult.problems,
      analyzedAt: '2026-09-03T12:00:00.000Z',
    });
    expect(analysis).not.toHaveProperty('opportunities');
  });

  it('salva a análise em meetings.metadata, não em summaries', async () => {
    results.push({ rows: [], rowCount: 1 });
    const analysis = createConversationAiAnalysis(aiResult);

    await saveConversationAiAnalysis('2ac03af3-f536-4f9e-b25e-1d750291c40c', analysis);

    const [sql, params = []] = query.mock.calls[0];
    expect(sql).toContain("jsonb_build_object('ai_analysis'");
    expect(sql).not.toContain('summaries');
    expect(params[0]).toBe('2ac03af3-f536-4f9e-b25e-1d750291c40c');
    expect(JSON.parse(params[1] as string).summary).toBe(aiResult.summary);
  });

  it('recupera a análise persistida ao reabrir a gravação do Plaud', async () => {
    const analysis = createConversationAiAnalysis(aiResult, new Date('2026-09-03T12:00:00Z'));
    results.push({
      rows: [{
        id: '2ac03af3-f536-4f9e-b25e-1d750291c40c',
        status: 'summarized',
        updated_at: '2026-09-03T12:00:00Z',
        ai_analysis: analysis,
        topics: [],
        participants: [],
        legacy_summary: 'não deve vencer',
      }],
    });

    const found = await getConversationAiAnalysisByPlaudFileId('18cdda3701858bcfa7bf0508fcf5beaf');

    expect(found?.localConversationId).toBe('2ac03af3-f536-4f9e-b25e-1d750291c40c');
    expect(found?.analysis).toEqual(analysis);
    expect(query.mock.calls[0][1]).toEqual(['18cdda3701858bcfa7bf0508fcf5beaf']);
  });

  it('recupera análises antigas que eram gravadas no campo de resumo', async () => {
    results.push({
      rows: [{
        id: '2ac03af3-f536-4f9e-b25e-1d750291c40c',
        status: 'summarized',
        updated_at: '2026-09-02T20:00:00Z',
        ai_analysis: null,
        topics: ['Indicadores'],
        participants: ['Fabio'],
        legacy_summary: 'Análise já gerada anteriormente',
      }],
    });
    results.push({ rows: [], rowCount: 1 });

    const found = await getConversationAiAnalysisByPlaudFileId('18cdda3701858bcfa7bf0508fcf5beaf');

    expect(found?.analysis?.summary).toBe('Análise já gerada anteriormente');
    expect(found?.analysis?.topics).toEqual(['Indicadores']);
    expect(found?.analysis?.problems).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("jsonb_build_object('ai_analysis'");
  });

  it('não confunde uma gravação apenas ingerida com uma análise da IA', async () => {
    results.push({
      rows: [{
        id: '2ac03af3-f536-4f9e-b25e-1d750291c40c',
        status: 'received',
        updated_at: '2026-09-02T20:00:00Z',
        ai_analysis: null,
        topics: [],
        participants: [],
        legacy_summary: 'Resumo original do Plaud',
      }],
    });

    const found = await getConversationAiAnalysisByPlaudFileId('18cdda3701858bcfa7bf0508fcf5beaf');

    expect(found?.analysis).toBeNull();
  });
});
