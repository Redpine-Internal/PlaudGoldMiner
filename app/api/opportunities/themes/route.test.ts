import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes da rota de temas.
 *
 * O que importa aqui é o contrato de custo e de atomicidade: abrir a página não
 * pode gastar cota da Azure, e um agrupamento que falhe no meio não pode deixar
 * a tela com metade dos temas.
 */

interface Call {
  sql: string;
  params: unknown[];
}

const calls: Call[] = [];
const results: Array<{ rows: unknown[]; rowCount?: number }> = [];

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  calls.push({ sql, params });
  return results.shift() ?? { rows: [], rowCount: 0 };
});

const release = vi.fn();
vi.mock('@/lib/db', () => ({
  pool: {
    query,
    connect: async () => ({ query, release }),
  },
}));

const groupBusinessThemes = vi.fn();
vi.mock('@/lib/ai/services/business-theme-grouper', () => ({
  groupBusinessThemes: (...args: unknown[]) => groupBusinessThemes(...args),
}));

const { GET, POST } = await import('./route');

/** Linha como o Postgres devolve, já agregada. */
const linha = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Cultura e liderança',
  rationale: 'o que une o grupo',
  updated_at: '2026-08-31',
  opportunity_ids: ['o1', 'o2'],
  conversation_count: 9,
  conversation_titles: ['Conversa A', 'Conversa B'],
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
  query.mockClear();
  release.mockClear();
  groupBusinessThemes.mockReset();
});

describe('GET /api/opportunities/themes', () => {
  it('lê o cache sem nunca chamar a IA', async () => {
    // A cota da Azure é apertada; abrir a página não pode consumi-la.
    results.push({ rows: [linha()] }, { rows: [{ n: 0 }] });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(groupBusinessThemes).not.toHaveBeenCalled();
    expect(body.data[0].conversationCount).toBe(9);
    expect(body.data[0].opportunityIds).toEqual(['o1', 'o2']);
    expect(calls[0].sql).toContain("status IS DISTINCT FROM 'descartada'");
    expect(calls[0].sql).toContain("c.status = 'processado'");
    expect(calls[1].sql).toContain("status IS DISTINCT FROM 'descartada'");
  });

  it('informa quantos negócios ficaram fora dos temas', async () => {
    // É o gatilho de "reagrupar": sem isso o usuário teria que adivinhar.
    results.push({ rows: [linha()] }, { rows: [{ n: 3 }] });

    const body = await (await GET()).json();

    expect(body.ungrouped).toBe(3);
  });

  it('responde 500 sem vazar o erro interno', async () => {
    query.mockImplementationOnce(async () => {
      throw new Error('connection refused para postgres://user:senha@host');
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('senha');
  });
});

describe('POST /api/opportunities/themes', () => {
  const candidatos = (n: number) => ({
    rows: Array.from({ length: n }, (_, i) => ({
      id: `o${i}`,
      title: `Negócio ${i}`,
      type: 'consultoria',
      subtype: null,
    })),
    rowCount: n,
  });

  it('substitui o cache inteiro dentro de uma transação', async () => {
    // Um agrupamento parcial na tela é pior que o antigo: alguns negócios
    // apareceriam sem tema e outros num tema que já não corresponde.
    results.push(candidatos(2));
    groupBusinessThemes.mockResolvedValue({
      success: true,
      data: [{ name: 'Cultura', rationale: 'porque sim', opportunityIds: ['o0', 'o1'] }],
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls).toContain('BEGIN');
    expect(sqls.some((s) => s.startsWith('DELETE FROM app_business_themes'))).toBe(true);
    expect(sqls).toContain('COMMIT');
    // O DELETE precisa vir DEPOIS do sucesso da IA: apagar antes deixaria a tela
    // vazia se o modelo falhasse.
    expect(sqls.indexOf('BEGIN')).toBeGreaterThan(0);
    expect(calls[0].sql).toContain("status IS DISTINCT FROM 'descartada'");
    expect(body.message).toContain('1 tema');
    expect(release).toHaveBeenCalled();
  });

  it('não apaga o cache quando a IA falha', async () => {
    results.push(candidatos(2));
    groupBusinessThemes.mockResolvedValue({
      success: false,
      error: { code: 'RATE_LIMIT', message: 'cota estourada' },
    });

    const res = await POST();

    expect(res.status).toBe(429);
    expect(calls.map((c) => c.sql.trim())).not.toContain('BEGIN');
    expect(release).toHaveBeenCalled();
  });

  it('recusa agrupar quando não há negócio nenhum', async () => {
    results.push({ rows: [], rowCount: 0 });

    const res = await POST();

    expect(res.status).toBe(400);
    expect(groupBusinessThemes).not.toHaveBeenCalled();
  });

  it('faz ROLLBACK e devolve a conexão quando a gravação falha', async () => {
    results.push(candidatos(1));
    groupBusinessThemes.mockResolvedValue({
      success: true,
      data: [{ name: 'Cultura', rationale: null, opportunityIds: ['o0'] }],
    });
    // BEGIN passa, o DELETE explode.
    query.mockImplementationOnce(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return results.shift() ?? { rows: [], rowCount: 0 };
    });
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockImplementationOnce(async () => {
      throw new Error('deadlock');
    });

    const res = await POST();

    expect(res.status).toBe(500);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });
});
