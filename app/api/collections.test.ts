import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query, responses } = vi.hoisted(() => {
  const responses: Array<{ rows: unknown[] }> = [];
  return { responses, query: vi.fn(async () => responses.shift() ?? { rows: [] }) };
});
vi.mock('@/lib/db', () => ({ pool: { query }, db: {} }));
vi.mock('@/lib/n8n/enrich', () => ({ enrichWithConversation: async (rows: unknown[]) => rows }));

import { GET as conversations } from '@/app/api/conversations/route';
import { GET as contents } from '@/app/api/contents/route';
import { GET as opportunities } from '@/app/api/opportunities/route';
import { GET as projects } from '@/app/api/projects/route';

const request = (path: string) => new NextRequest(new URL(path, 'http://localhost'));
const calls = () => query.mock.calls as unknown as Array<[string, unknown[]]>;

beforeEach(() => { query.mockClear(); responses.length = 0; });

describe('paginação das coleções', () => {
  it.each([
    ['conversations', conversations], ['contents', contents],
    ['opportunities', opportunities], ['projects', projects],
  ] as const)('%s alcança páginas além de 100 registros sem truncar o total', async (path, get) => {
    responses.push({ rows: [] }, { rows: [{ total: '241' }] });
    const response = await get(request(`/api/${path}?limit=20&offset=120`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 241, limit: 20, offset: 120 });
    const [list, count] = calls();
    expect(list[0]).toMatch(/ORDER BY[\s\S]*DESC, .*id DESC\s+LIMIT \$1 OFFSET \$2/);
    expect(list[1]).toEqual([20, 120]);
    expect(count[0]).not.toContain('LIMIT');
  });

  it.each([
    ['conversations', conversations], ['contents', contents],
    ['opportunities', opportunities], ['projects', projects],
  ] as const)('%s ignora offset inválido sem gerar SQL inválido', async (path, get) => {
    responses.push({ rows: [] }, { rows: [{ total: '0' }] });
    await get(request(`/api/${path}?limit=10000&offset=-5`));
    expect(calls()[0][1].slice(-2)).toEqual([200, 0]);
  });
});

describe('filtros globais e contadores', () => {
  it('conteúdos aplica formatos, busca e interessantes antes de paginar; status counts não fica preso ao status ativo', async () => {
    responses.push(
      { rows: [] }, { rows: [{ total: '2' }] },
      { rows: [{ status: 'rascunho', total: '2' }, { status: 'sugerido', total: '110' }] },
      { rows: [{ platform: 'artigo' }, { platform: 'legado' }] },
    );
    const response = await contents(request('/api/contents?platform=artigo&platform=post&search=Segurança&interesting=true&status=rascunho&limit=20&offset=100'));
    expect(await response.json()).toMatchObject({ total: 2, counts: { rascunho: 2, sugerido: 110 }, platforms: ['artigo', 'legado'] });
    const [list, count, status] = calls();
    expect(list[1]).toEqual([['artigo', 'post'], '%seguranca%', 'rascunho', 20, 100]);
    expect(count[1]).toEqual(list[1].slice(0, -2));
    expect(list[0]).toContain('c.platform = ANY($1::text[])');
    expect(list[0]).toContain("e.source_type = 'content'");
    expect(list[0]).toContain('e.source_id::text = c.id::text');
    expect(list[0]).toContain('e.interesting = true');
    expect(status[1]).toEqual([['artigo', 'post'], '%seguranca%']);
    expect(status[0]).not.toContain('c.status =');
  });

  it('novos negócios combina tipos, score e favoritos com busca literal', async () => {
    responses.push({ rows: [] }, { rows: [{ total: '0' }] });
    await opportunities(request('/api/opportunities?type=consultoria&type=produto&minScore=85&interesting=true&search=50%25_oferta&status=nova'));
    const [list, count] = calls();
    expect(list[1]).toEqual([['consultoria', 'produto'], '%50\\%\\_oferta%', 85, 'nova', 50, 0]);
    expect(count[1]).toEqual(list[1].slice(0, -2));
    expect(list[0]).toContain('o.score >= $3');
    expect(list[0]).toContain("e.source_type = 'opportunity'");
    expect(list[0]).toContain('e.source_id::text = o.id::text');
    expect(list[0]).not.toContain('50%_oferta');
  });

  it('projetos conta todos os status da busca, mesmo além da página atual', async () => {
    responses.push({ rows: [] }, { rows: [{ total: '120' }] }, { rows: [{ status: 'ativo', total: '120' }, { status: 'arquivado', total: '8' }] });
    const response = await projects(request('/api/projects?status=ativo&search=execução&limit=20&offset=100'));
    expect(await response.json()).toMatchObject({ total: 120, counts: { ativo: 120, arquivado: 8 } });
    expect(calls()[0][1]).toEqual(['%execucao%', 'ativo', 20, 100]);
    expect(calls()[2][1]).toEqual(['%execucao%']);
  });
});

describe('acervo unificado de conversas', () => {
  it('formata milissegundos do Plaud sem reinterpretar duração legada ou de upload', async () => {
    const data = [
      { id: 'plaud-ms', source: 'plaud', duration: '3415000' },
      { id: 'plaud-number', source: 'plaud', duration: 3720000 },
      { id: 'plaud-legacy', source: 'plaud', duration: '01:02:03' },
      { id: 'plaud-readable', source: 'plaud', duration: '1h 2min' },
      { id: 'empty', source: 'plaud', duration: null },
      { id: 'upload', source: 'upload', duration: '3415000' },
      { id: 'drive', source: 'drive', duration: '01:02:03' },
    ];
    responses.push({ rows: data }, { rows: [{ total: '7' }] });
    const response = await conversations(request('/api/conversations'));
    const body = await response.json();
    expect(body.data.map((row: { duration: unknown }) => row.duration)).toEqual([
      '57min', '1h 2min', '01:02:03', '1h 2min', null, '3415000', '01:02:03',
    ]);
  });

  it('devolve uploads, Drive e identificador Plaud sem substituir os ids locais', async () => {
    const data = [
      { id: 'upload-local', source: 'upload', sourceFileId: null, hasTranscription: true },
      { id: 'drive-local', source: 'drive', sourceFileId: 'drive-file' },
      { id: 'plaud-local', source: 'plaud', sourceFileId: 'a'.repeat(32) },
    ];
    responses.push({ rows: data }, { rows: [{ total: '258' }] });
    const response = await conversations(request('/api/conversations'));
    expect(await response.json()).toMatchObject({ data, total: 258 });
    expect(calls()[0][0]).toContain('FROM conversations c');
    expect(calls()[0][0]).not.toContain("source = 'plaud'");
  });

  it('combina período inclusivo, múltiplos tipos e disponibilidade no total e na página', async () => {
    responses.push({ rows: [] }, { rows: [{ total: '31' }] });
    await conversations(request('/api/conversations?type=reuniao&type=informal&from=2026-08-01&to=2026-08-31&content=hasTranscription&content=hasInsights&search=Segurança&limit=20&offset=20'));
    const [list, count] = calls();
    expect(list[1]).toEqual([['reuniao', 'informal'], '%seguranca%', '2026-08-01', '2026-08-31', 20, 20]);
    expect(count[1]).toEqual(list[1].slice(0, -2));
    for (const [sql] of [list, count]) {
      expect(sql).toContain('c.date >= $3::date');
      expect(sql).toContain("c.date < $4::date + INTERVAL '1 day'");
      expect(sql).toContain("NULLIF(btrim(c.transcription), '') IS NOT NULL");
      expect(sql).toContain('app_opportunity_sources');
      expect(sql).toContain('o.conversation_id::text = c.id::text');
      expect(sql).toContain('s.conversation_id::text = c.id::text');
      expect(sql).toContain('s.opportunity_id::text = o.id::text');
    }
  });

  it.each(['from=2026-09-03&to=2026-09-01', 'from=2026-02-30', 'content=unknown', 'type=invalid'])('recusa filtro inválido sem consultar o banco: %s', async (filter) => {
    const response = await conversations(request(`/api/conversations?${filter}`));
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
