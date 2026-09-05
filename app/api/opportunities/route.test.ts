import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Testes das rotas de Novos Negócios.
 *
 * O pool do Postgres é substituído por um espião que registra SQL e parâmetros:
 * o que se verifica aqui é a montagem das queries (filtros, placeholders,
 * transação) e o formato da resposta — não o banco.
 */

interface Call {
  sql: string;
  params: unknown[];
}

const calls: Call[] = [];
/** Resposta por chamada, na ordem. `undefined` cai no padrão vazio. */
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

// A rota enriquece os cards com dados da conversa via n8n. Aqui a identidade
// basta: o enriquecimento tem sua própria responsabilidade.
vi.mock('@/lib/n8n/enrich', () => ({
  enrichWithConversation: async (rows: unknown[]) => rows,
}));

const { GET } = await import('./route');
const { DELETE, PATCH } = await import('./[id]/route');

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
  query.mockClear();
  release.mockClear();
});

describe('GET /api/opportunities', () => {
  it('não aplica WHERE quando não há filtros', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities'));

    // O SELECT tem uma subquery de contagem com WHERE próprio; o que não pode
    // existir é filtro no nível externo. A contagem é o teste mais limpo disso.
    const [, count] = calls;
    expect(count.sql).not.toContain('WHERE');
    expect(count.params).toEqual([]);
    expect(calls[0].params).toEqual([50, 0]);
  });

  it('aplica status e type como parâmetros ligados, nunca interpolados', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?status=nova&type=consultoria'));

    const [lista] = calls;
    expect(lista.sql).toContain('status = $2');
    expect(lista.sql).toContain('type = ANY($1::text[])');
    // O valor entra só como parâmetro — nada do usuário vira texto de SQL.
    expect(lista.sql).not.toContain('nova');
    expect(lista.params).toEqual([['consultoria'], 'nova', 50, 0]);
  });

  it('usa o mesmo WHERE e os mesmos valores na contagem', async () => {
    // A contagem precisa refletir o filtro; se divergir, a paginação mente.
    results.push({ rows: [] }, { rows: [{ total: '7' }] });

    await GET(req('/api/opportunities?status=nova'));

    const [, count] = calls;
    expect(count.sql).toContain('status = $1');
    expect(count.params).toEqual(['nova']);
  });

  it('limita o teto a 200 mesmo se o cliente pedir mais', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?limit=5000'));

    expect(calls[0].params.at(-2)).toBe(200);
  });

  it('cai no padrão 50 quando o limite não é um número válido', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?limit=abc'));

    expect(calls[0].params.at(-2)).toBe(50);
  });

  it('cai no padrão 50 para limite zero ou negativo', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?limit=-10'));

    expect(calls[0].params.at(-2)).toBe(50);
  });

  it('devolve total numérico e a contagem de fontes de cada negócio', async () => {
    results.push(
      {
        rows: [
          {
            id: 'o1',
            conversation_id: 'c1',
            title: 'Negócio',
            pain: 'dor',
            context: null,
            score: 80,
            type: 'consultoria',
            subtype: null,
            generated_idea: null,
            status: 'nova',
            notes: null,
            created_at: '2026-08-01',
            source_count: 4,
          },
        ],
      },
      { rows: [{ total: '1' }] }
    );

    const res = await GET(req('/api/opportunities'));
    const body = await res.json();

    // total vem do Postgres como string; a UI depende dele ser número.
    expect(body.total).toBe(1);
    expect(body.data[0].sourceCount).toBe(4);
    expect(body.data[0].generatedIdea).toBeNull();
  });

  it('traz prioridade e tema junto com o negócio', async () => {
    // A visão "Por tema" é montada a partir desta mesma listagem; sem o JOIN a
    // alternância na página não teria como saber a que tema cada card pertence.
    results.push(
      {
        rows: [
          {
            id: 'o1',
            conversation_id: 'c1',
            title: 'Negócio',
            pain: 'dor',
            context: null,
            score: 80,
            type: 'consultoria',
            subtype: null,
            generated_idea: null,
            status: 'nova',
            notes: null,
            created_at: '2026-08-01',
            source_count: 4,
            priority: 'alta',
            theme_id: 't1',
            theme_name: 'Cultura e liderança',
          },
        ],
      },
      { rows: [{ total: '1' }] }
    );

    const res = await GET(req('/api/opportunities'));
    const body = await res.json();

    expect(calls[0].sql).toContain('app_business_theme_members');
    expect(body.data[0].priority).toBe('alta');
    expect(body.data[0].themeName).toBe('Cultura e liderança');
  });

  it('deixa prioridade e tema nulos no negócio ainda não agrupado', async () => {
    // O LEFT JOIN devolve NULL, e a UI diferencia "sem tema" de "sem valor".
    results.push(
      {
        rows: [
          {
            id: 'o2',
            conversation_id: null,
            title: 'Negócio novo',
            pain: 'dor',
            context: null,
            score: 40,
            type: 'treinamento',
            subtype: null,
            generated_idea: null,
            status: 'nova',
            notes: null,
            created_at: '2026-08-02',
            source_count: 1,
            priority: null,
            theme_id: null,
            theme_name: null,
          },
        ],
      },
      { rows: [{ total: '1' }] }
    );

    const res = await GET(req('/api/opportunities'));
    const body = await res.json();

    expect(body.data[0].priority).toBeNull();
    expect(body.data[0].themeId).toBeNull();
  });

  it('responde 500 sem vazar o erro interno quando o banco falha', async () => {
    query.mockImplementationOnce(async () => {
      throw new Error('connection refused para postgres://user:senha@host');
    });

    const res = await GET(req('/api/opportunities'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('senha');
  });
});

describe('DELETE /api/opportunities/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it('apaga fontes e oportunidade e retira o favorito na mesma transação, preservando o enrichment', async () => {
    results.push(
      { rows: [] }, // BEGIN
      { rows: [], rowCount: 3 }, // DELETE fontes
      { rows: [], rowCount: 1 }, // DELETE oportunidade
      { rows: [], rowCount: 1 }, // UPDATE favorito
      { rows: [] } // COMMIT
    );

    const res = await DELETE(req('/api/opportunities/o1'), params('o1'));

    expect(res.status).toBe(200);
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toBe('DELETE FROM app_opportunity_sources WHERE opportunity_id = $1');
    expect(sqls[2]).toBe('DELETE FROM app_opportunities WHERE id = $1');
    expect(sqls[3].replace(/\s+/g, ' ')).toBe(
      "UPDATE app_idea_enrichment SET interesting = false WHERE source_type = 'opportunity' AND source_id = $1"
    );
    expect(calls.slice(1, 4).map((call) => call.params)).toEqual([['o1'], ['o1'], ['o1']]);
    // A atualização é limitada à marca: nenhuma nota, texto ou referência é apagada.
    expect(sqls).toHaveLength(5);
    expect(sqls[4]).toBe('COMMIT');
    expect(await res.json()).toEqual({ data: { id: 'o1', deleted: true } });
    expect(release).toHaveBeenCalled();
  });

  it('responde 404 quando o id não existe', async () => {
    results.push(
      { rows: [] }, { rows: [], rowCount: 0 }, { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 }, { rows: [] }
    );

    const res = await DELETE(req('/api/opportunities/inexistente'), params('inexistente'));

    expect(res.status).toBe(404);
  });

  it.each([
    [1, 'DELETE FROM app_opportunity_sources'],
    [2, 'DELETE FROM app_opportunities'],
    [3, 'UPDATE app_idea_enrichment'],
  ])('faz ROLLBACK quando a etapa %i falha (%s)', async (failedStep, failedSql) => {
    for (let step = 0; step < failedStep; step++) {
      query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    }
    query.mockRejectedValueOnce(new Error('deadlock'));

    const res = await DELETE(req('/api/opportunities/o1'), params('o1'));

    expect(res.status).toBe(500);
    const sqls = query.mock.calls.map(([sql]) => sql.trim());
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[failedStep]).toContain(failedSql);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(sqls).toHaveLength(failedStep + 2);
    // Sem release o pool vaza uma conexão a cada falha.
    expect(release).toHaveBeenCalled();
  });
});

describe('PATCH /api/opportunities/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const patch = (id: string, body: unknown) =>
    new NextRequest(new URL(`/api/opportunities/${id}`, 'http://localhost'), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

  it('grava a prioridade marcada', async () => {
    results.push({ rows: [], rowCount: 1 });

    const res = await PATCH(patch('o1', { priority: 'alta' }), params('o1'));

    expect(res.status).toBe(200);
    expect(calls[0].params).toEqual(['alta', 'o1']);
  });

  it('aceita null para limpar a marca', async () => {
    results.push({ rows: [], rowCount: 1 });

    const res = await PATCH(patch('o1', { priority: null }), params('o1'));

    expect(res.status).toBe(200);
    expect(calls[0].params).toEqual([null, 'o1']);
  });

  it('recusa valor fora da lista sem tocar no banco', async () => {
    // O valor vai direto para uma coluna text sem CHECK; a validação aqui é a
    // única coisa entre o cliente e um "prioridade: urgentíssimo" no banco.
    const res = await PATCH(patch('o1', { priority: 'urgentissimo' }), params('o1'));

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('recusa a edição de qualquer outro campo', async () => {
    // O texto do negócio vem da IA e é rastreável até a conversa de origem.
    const res = await PATCH(patch('o1', { title: 'outro título' }), params('o1'));

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o negócio não existe', async () => {
    results.push({ rows: [], rowCount: 0 });

    const res = await PATCH(patch('sumido', { priority: 'baixa' }), params('sumido'));

    expect(res.status).toBe(404);
  });
});
