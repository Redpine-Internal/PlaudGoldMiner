import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ pool: { query } }));

const { GET } = await import('@/app/api/enrichment/interesting/route');

beforeEach(() => query.mockReset());

describe('GET /api/enrichment/interesting', () => {
  it('entrega o rascunho e a ficha existentes do conteúdo sem substituir o override', async () => {
    const content = {
      enrichmentId: 'e-published', sourceType: 'content', sourceId: 'content-published',
      title: 'Piloto aprovado', subtitle: 'Piloto operacional',
      draft: 'Artigo salvo com conclusões e próximos passos.',
      outline: '{"angle":"Aprendizado do piloto","points":["Executar","Avaliar"]}',
      platform: 'artigo', subtype: 'LinkedIn', status: 'publicado',
      textOverride: 'Edição pessoal mantida', notes: 'Notas mantidas', refCount: 2,
    };
    query.mockResolvedValueOnce({ rows: [content] });
    const response = await GET();
    const sql = query.mock.calls[0][0] as string;
    for (const column of ['draft', 'outline', 'platform', 'subtype', 'status']) {
      expect(sql).toMatch(new RegExp(`c\\.${column}\\s+AS "${column}"`));
    }
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [content] });
    expect(query).toHaveBeenCalledOnce();
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('exclui apenas oportunidades órfãs, sem exigir origem local de insights ou conteúdos', async () => {
    const rows = [
      { enrichmentId: 'e1', sourceType: 'insight', sourceId: 'legacy', title: null },
      { enrichmentId: 'e2', sourceType: 'content', sourceId: 'legacy-content', title: null },
    ];
    query.mockResolvedValueOnce({ rows });

    const response = await GET();

    const sql = query.mock.calls[0][0] as string;
    const where = sql.slice(sql.indexOf('WHERE e.interesting')).replace(/\s+/g, ' ').trim();
    expect(where).toBe(
      "WHERE e.interesting = true AND (e.source_type <> 'opportunity' OR o.id IS NOT NULL) ORDER BY e.updated_at DESC"
    );
    expect(sql).toContain("LEFT JOIN app_opportunities o ON e.source_type = 'opportunity' AND o.id = e.source_id");
    expect(sql).toContain('e.notes');
    expect(sql).toContain('FROM app_idea_enrichment_reference');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: rows });
  });

  it('não disfarça erro de leitura como lista vazia', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to list interesting' });
  });
});
