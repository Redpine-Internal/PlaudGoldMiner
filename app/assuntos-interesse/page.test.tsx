import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  openEnrichment: vi.fn(),
  rows: [] as Array<{ onClick?: () => void }>,
}));
vi.mock('swr', () => ({ default: () => ({ data: { data: mocks.items }, isLoading: false, mutate: vi.fn() }) }));
vi.mock('@/components/ds', () => ({
  useEnrichment: () => ({ openEnrichment: mocks.openEnrichment }),
  EmptyState: () => null,
}));
vi.mock('@/components/lg/GlassList', () => ({
  GlassList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  GlassListRow: (props: { children: ReactNode; onClick?: () => void }) => {
    mocks.rows.push(props);
    return <div>{props.children}</div>;
  },
}));

import AssuntosInteressePage from '@/app/assuntos-interesse/page';

beforeEach(() => { mocks.items = []; mocks.rows = []; mocks.openEnrichment.mockClear(); });

const content = {
  enrichmentId: 'enrichment-a', sourceType: 'content', sourceId: 'content-a', title: 'Piloto aprovado',
  subtitle: 'Piloto operacional', textOverride: null, updatedAt: null, refCount: 0, notes: null,
  draft: 'Artigo salvo com conclusões e próximos passos.',
  outline: '{"angle":"Aprendizado","points":["Executar","Avaliar"]}',
  platform: 'artigo', subtype: ' LinkedIn ', status: 'publicado',
};

describe('abrir conteúdos interessantes', () => {
  it.each([null, 'Edição pessoal'])('envia rascunho, estrutura e rótulos do conteúdo, mantendo o tema separado do override (%s)', (textOverride) => {
    mocks.items = [{ ...content, textOverride }];
    renderToStaticMarkup(<AssuntosInteressePage />);
    mocks.rows[0].onClick?.();
    expect(mocks.openEnrichment).toHaveBeenCalledWith('content', 'content-a', {
      title: 'Piloto aprovado', originalText: 'Piloto operacional',
      draft: content.draft, outline: content.outline,
      formatLabel: 'Artigo', subtypeLabel: 'LinkedIn', statusLabel: 'Publicado',
    });
    expect(mocks.items[0].textOverride).toBe(textOverride);
  });

  it('preserva o comportamento de abertura dos negócios', () => {
    mocks.items = [{ ...content, sourceType: 'opportunity', sourceId: 'opportunity-a', textOverride: 'Texto enriquecido do negócio' }];
    renderToStaticMarkup(<AssuntosInteressePage />);
    mocks.rows[0].onClick?.();
    expect(mocks.openEnrichment).toHaveBeenCalledWith('opportunity', 'opportunity-a', {
      title: 'Piloto aprovado', originalText: 'Texto enriquecido do negócio',
    });
  });
});
