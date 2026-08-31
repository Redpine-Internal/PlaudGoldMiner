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
    expect(calls[0].params).toEqual([50]);
  });

  it('aplica status e type como parâmetros ligados, nunca interpolados', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?status=nova&type=consultoria'));

    const [lista] = calls;
    expect(lista.sql).toContain('status = $1');
    expect(lista.sql).toContain('type = $2');
    // O valor entra só como parâmetro — nada do usuário vira texto de SQL.
    expect(lista.sql).not.toContain('nova');
    expect(lista.params).toEqual(['nova', 'consultoria', 50]);
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

    expect(calls[0].params.at(-1)).toBe(200);
  });

  it('cai no padrão 50 quando o limite não é um número válido', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?limit=abc'));

    expect(calls[0].params.at(-1)).toBe(50);
  });

  it('cai no padrão 50 para limite zero ou negativo', async () => {
    results.push({ rows: [] }, { rows: [{ total: '0' }] });

    await GET(req('/api/opportunities?limit=-10'));

    expect(calls[0].params.at(-1)).toBe(50);
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

  it('apaga as fontes e a oportunidade dentro de uma transação', async () => {
    results.push(
      { rows: [] }, // BEGIN
      { rows: [], rowCount: 3 }, // DELETE fontes
      { rows: [], rowCount: 1 }, // DELETE oportunidade
      { rows: [] } // COMMIT
    );

    const res = await DELETE(req('/api/opportunities/o1'), params('o1'));

    expect(res.status).toBe(200);
    const sqls = calls.map((c) => c.sql.trim());
    expect(sqls[0]).toBe('BEGIN');
    // As fontes saem ANTES: não há foreign key, então a ordem inversa deixaria
    // órfãos se a segunda remoção falhasse.
    expect(sqls[1]).toContain('app_opportunity_sources');
    expect(sqls[2]).toContain('DELETE FROM app_opportunities');
    expect(sqls[3]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('responde 404 quando o id não existe', async () => {
    results.push({ rows: [] }, { rows: [], rowCount: 0 }, { rows: [], rowCount: 0 }, { rows: [] });

    const res = await DELETE(req('/api/opportunities/inexistente'), params('inexistente'));

    expect(res.status).toBe(404);
  });

  it('faz ROLLBACK e devolve a conexão quando a remoção falha', async () => {
    query.mockImplementationOnce(async () => ({ rows: [] })); // BEGIN
    query.mockImplementationOnce(async () => {
      throw new Error('deadlock');
    });

    const res = await DELETE(req('/api/opportunities/o1'), params('o1'));

    expect(res.status).toBe(500);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
    // Sem release o pool vaza uma conexão a cada falha.
    expect(release).toHaveBeenCalled();
  });
});

describe('PATCH /api/opportunities/[id]', () => {
  it('recusa edição com 405 nesta fase', async () => {
    const res = await PATCH();

    expect(res.status).toBe(405);
  });
});
