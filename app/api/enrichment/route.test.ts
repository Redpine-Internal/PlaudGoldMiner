import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ pool: { query } }));

const { GET, PUT } = await import('@/app/api/enrichment/route');

beforeEach(() => query.mockReset());

describe('/api/enrichment eligibility', () => {
  it('não entrega enriquecimento de uma oportunidade fora da mineração', async () => {
    query.mockResolvedValueOnce({ rows: [{ eligible: false }] });
    const response = await GET(new NextRequest(
      'http://localhost/api/enrichment?sourceType=opportunity&sourceId=op-1'
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('eligible_conversation.type IN');
  });

  it('bloqueia a edição de conteúdo fora da mineração', async () => {
    query.mockResolvedValueOnce({ rows: [{ eligible: false }] });
    const response = await PUT(new NextRequest('http://localhost/api/enrichment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType: 'content', sourceId: 'content-1', interesting: true }),
    }));

    expect(response.status).toBe(409);
    expect(query).toHaveBeenCalledOnce();
  });

  it('preserva enriquecimentos legados do tipo insight', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'e-1', sourceType: 'insight', sourceId: 'i-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await GET(new NextRequest(
      'http://localhost/api/enrichment?sourceType=insight&sourceId=i-1'
    ));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
