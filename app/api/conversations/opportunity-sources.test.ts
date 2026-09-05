import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const { where, results, getFileContent } = vi.hoisted(() => ({
  where: vi.fn(), results: [] as unknown[][],
  getFileContent: vi.fn(async () => ({ transcript: 'Transcrição', summary: 'Resumo' })),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: (condition: unknown) => {
      where(condition);
      const rows = results.shift() ?? [];
      return { then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve), limit: async () => rows };
    } }) }),
  },
}));
vi.mock('@/lib/plaud/client', () => ({ getFileContent }));
vi.mock('@/lib/plaud/tokens', () => ({ PlaudAuthError: class extends Error {}, PLAUD_AUTH_CLIENT_MESSAGE: 'Reconecte o Plaud' }));

import { GET as opportunityDetail } from '@/app/api/conversations/[id]/opportunities/route';
import { GET as plaudStatus } from '@/app/api/plaud/files/[id]/status/route';
import { GET as conversationDetail } from '@/app/api/conversations/[id]/route';

const dialect = new PgDialect();
const request = new NextRequest('http://localhost/api/conversations/c-secondary/opportunities');
const params = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => { where.mockClear(); results.length = 0; getFileContent.mockClear(); });

describe('negócios sustentados por conversas secundárias', () => {
  it('o detalhe local normaliza duração Plaud sem alterar duração de upload', async () => {
    results.push([{ id: 'plaud-local', source: 'plaud', duration: '3415000' }]);
    const plaud = await conversationDetail(request, params('plaud-local'));
    expect(await plaud.json()).toMatchObject({ data: { duration: '57min' } });
    results.push([{ id: 'upload-local', source: 'upload', duration: '3415000' }]);
    const upload = await conversationDetail(request, params('upload-local'));
    expect(await upload.json()).toMatchObject({ data: { duration: '3415000' } });
  });

  it('o detalhe inclui fonte primária ou evidência adicional sem multiplicar a oportunidade', async () => {
    results.push([{ id: 'shared-opportunity', conversationId: 'primary' }]);
    const response = await opportunityDetail(request, params('secondary'));
    expect(await response.json()).toEqual({ data: [{ id: 'shared-opportunity', conversationId: 'primary' }] });
    const query = dialect.sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(query.sql).toContain('"app_opportunities"."conversation_id" = $1');
    expect(query.sql).toContain('or EXISTS');
    expect(query.sql).toContain('app_opportunity_sources');
    expect(query.sql).toContain('s.opportunity_id::text = "app_opportunities"."id"::text');
    expect(query.sql).toContain('s.conversation_id::text = $2::text');
    expect(query.params).toEqual(['secondary', 'secondary']);
  });

  it('hasInsights considera as fontes adicionais da gravação do Plaud', async () => {
    results.push([{ id: 'secondary' }], [{ id: 'shared-opportunity' }]);
    const response = await plaudStatus(request, params('plaud-file'));
    expect(await response.json()).toMatchObject({ data: { hasInsights: true, hasSummary: true, hasTranscription: true } });
    const query = dialect.sqlToQuery(where.mock.calls[1][0] as SQL);
    expect(query.sql).toContain('app_opportunity_sources');
    expect(query.sql).toContain('s.opportunity_id::text = "app_opportunities"."id"::text');
    expect(query.sql).toContain('s.conversation_id::text = $2::text');
    expect(query.params).toEqual(['secondary', 'secondary']);
    expect(getFileContent).toHaveBeenCalledWith('plaud-file');
  });
});
