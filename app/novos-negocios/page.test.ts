import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  themes: [] as Array<Record<string, unknown>>,
  total: 0,
  ungrouped: 0,
  openEnrichment: vi.fn(),
  onOpenItem: undefined as undefined | ((id: string) => void),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('swr', () => ({ default: (key: string) => ({
  data: key.includes('/themes') ? { data: state.themes, ungrouped: state.ungrouped } : { data: state.items, total: state.total, counts: {} },
  mutate: vi.fn(), isLoading: false, isValidating: false,
}) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/lg/usePersistedFilters', () => ({ usePersistedFilters: (_key: string, initial: object) => [{ ...initial, view: 'tema' }, vi.fn()] }));
vi.mock('@/components/lg/FilterRail', () => ({ FilterRail: () => null }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({ selectedOpportunityId: null, setSelectedOpportunityId: vi.fn() }) }));
vi.mock('@/components/ds', async () => {
  const { createElement } = await import('react');
  return {
    Button: ({ children, disabled }: { children?: React.ReactNode; disabled?: boolean }) => createElement('button', { disabled }, children),
    SearchInput: () => null,
    OpportunityCard: () => null,
    EmptyState: ({ title }: { title: string }) => createElement('p', null, title),
    Pagination: ({ pageCount }: { pageCount: number }) => createElement('nav', { 'data-page-count': pageCount }),
    StartProjectButton: () => null,
    GenerateBusinessModal: () => null,
    ThemeBoard: ({ onOpenItem }: { onOpenItem: (id: string) => void }) => {
      state.onOpenItem = onOpenItem;
      return createElement('div', { 'data-board': true });
    },
    useEnrichment: () => ({ openEnrichment: state.openEnrichment, isInteresting: () => false }),
  };
});

import NovosNegocios from '@/app/novos-negocios/page';

beforeEach(() => {
  vi.stubGlobal('React', React);
  state.items = [];
  state.themes = [];
  state.total = 0;
  state.ungrouped = 0;
  state.openEnrichment.mockClear();
  state.onOpenItem = undefined;
});

const render = () => renderToStaticMarkup(createElement(NovosNegocios));

describe('cobertura da página de negócios por tema', () => {
  it('mantém reagrupar acessível quando os temas existentes só têm membros em outras páginas', () => {
    state.themes = [{ id: 'old-theme', opportunityIds: ['older-item'] }];
    state.items = [{ id: 'new-item', title: 'Negócio novo', themeId: null, status: 'nova' }];
    state.total = 241;
    state.ungrouped = 1;
    const html = render();
    expect(html).toContain('Reagrupar');
    expect(html).toContain('Negócio novo</button>');
    expect(html).toContain('data-page-count="13"');
  });

  it('mostra o negócio descartado cujo themeId persiste mas não consta da resposta de temas', () => {
    state.themes = [{ id: 'current-theme', opportunityIds: ['active-item'] }];
    state.items = [{ id: 'discarded', title: 'Negócio descartado', themeId: 'current-theme', status: 'descartada' }];
    state.total = 1;
    expect(render()).toContain('Negócio descartado</button>');
  });

  it('abre o enriquecimento do membro visível com seu texto e identidade', () => {
    state.themes = [{ id: 'theme', opportunityIds: ['business'] }];
    state.items = [{ id: 'business', title: 'Diagnóstico', pain: 'Dor', context: 'Contexto', generatedIdea: 'Ideia', themeId: 'theme' }];
    state.total = 1;
    render();
    state.onOpenItem?.('business');
    expect(state.openEnrichment).toHaveBeenCalledWith('opportunity', 'business', expect.objectContaining({ title: 'Diagnóstico', pain: 'Dor', context: 'Contexto', generatedIdea: 'Ideia' }));
  });
});
