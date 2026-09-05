import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(),
  close: vi.fn(),
  push: vi.fn(),
  modal: vi.fn(),
  arrayStateIndex: 0,
  sources: [] as Array<{
    id: string;
    conversationId: string | null;
    conversationTitle: string | null;
    conversationDate: string | null;
    excerpt: string | null;
  }>,
  buttons: [] as Array<{ icon?: string; onClick?: () => Promise<void> }>,
}));
// Render the loaded editor without network effects; requests below remain mocked.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    // refs and sources are the editor's two initial array states. Supply the
    // fetched sources to the latter while keeping effects/network out of SSR.
    const value = Array.isArray(initial) && mocks.arrayStateIndex++ === 1 ? mocks.sources : initial;
    return actual.useState(value === true ? false : value);
  } };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/use-modal-dialog', () => ({ useModalDialog: mocks.modal }));
vi.mock('@/components/ds/enrichment/enrichment-autosave', () => ({ createEnrichmentAutosave: () => ({ flush: mocks.flush, schedule: vi.fn() }) }));
vi.mock('@/components/ds/Button', () => ({ Button: (props: { icon?: string; disabled?: boolean; children?: ReactNode; onClick?: () => Promise<void> }) => {
  mocks.buttons.push(props);
  return createElement('button', { disabled: props.disabled }, props.children);
} }));
vi.mock('@/components/ds/Icon', () => ({ Icon: () => null }));
import { IdeaEnrichmentModal } from '@/components/ds/enrichment/IdeaEnrichmentModal';

function renderEditor(sourceType: 'content' | 'opportunity' = 'content') {
  mocks.arrayStateIndex = 0;
  return renderToStaticMarkup(createElement(IdeaEnrichmentModal, {
    sourceType, sourceId: 'content-a', idea: { title: 'Ideia', originalText: 'Texto' }, onClose: mocks.close, onSaved: vi.fn(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buttons.length = 0;
  mocks.sources = [];
  mocks.flush.mockResolvedValue(undefined);
  mocks.modal.mockReturnValue({ current: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('conversas de origem do enriquecimento', () => {
  it.each(['content', 'opportunity'] as const)('conta conversas distintas e mantém todos os trechos em %s', (sourceType) => {
    mocks.sources = [
      { id: 'excerpt-1', conversationId: 'alfa', conversationTitle: 'Alfa', conversationDate: '2026-09-05T00:00:00.000Z', excerpt: 'Primeiro trecho' },
      { id: 'excerpt-2', conversationId: 'alfa', conversationTitle: 'Alfa', conversationDate: '2026-09-05T00:00:00.000Z', excerpt: 'Segundo trecho' },
      { id: 'excerpt-3', conversationId: 'beta', conversationTitle: 'Beta', conversationDate: '2026-08-04', excerpt: 'Terceiro trecho' },
    ];
    vi.stubEnv('TZ', 'America/New_York');
    const output = renderEditor(sourceType);
    expect(output).toContain('Conversas de origem (2)');
    expect(output).not.toContain('Conversas de origem (3)');
    expect(output).toContain('Primeiro trecho');
    expect(output).toContain('Segundo trecho');
    expect(output).toContain('Terceiro trecho');
    expect(output).toContain('05 de set. de 2026');
    expect(output).toContain('04 de ago. de 2026');
    expect(output).not.toContain('04 de set. de 2026');
    expect(output).not.toContain('03 de ago. de 2026');
  });

  it('usa o singular para trechos repetidos da mesma conversa e não conta fontes sem id', () => {
    mocks.sources = [
      { id: 'excerpt-1', conversationId: 'alfa', conversationTitle: 'Alfa', conversationDate: null, excerpt: 'Primeiro' },
      { id: 'excerpt-2', conversationId: 'alfa', conversationTitle: 'Alfa', conversationDate: null, excerpt: 'Segundo' },
      { id: 'excerpt-3', conversationId: null, conversationTitle: null, conversationDate: null, excerpt: 'Origem indisponível' },
    ];
    const output = renderEditor();
    expect(output).toContain('Conversa de origem');
    expect(output).not.toContain('Conversas de origem');
    expect(output).toContain('Origem indisponível');
  });

  it('não inventa uma contagem de conversas quando nenhuma origem tem id', () => {
    mocks.sources = [{ id: 'excerpt-1', conversationId: null, conversationTitle: null, conversationDate: 'inválida', excerpt: 'Trecho preservado' }];
    const output = renderEditor();
    expect(output).toContain('Fontes de origem');
    expect(output).toContain('Data não informada');
    expect(output).toContain('Trecho preservado');
  });
});

describe('Enrichment dialog lifecycle', () => {
  it('connects the semantic dialog to the focus/Escape hook and awaits pending saves before closing', async () => {
    let finish!: () => void;
    mocks.flush.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const output = renderEditor();
    expect(output).toContain('role="dialog"');
    expect(output).toContain('aria-modal="true"');
    expect(output).toContain('aria-labelledby="enrichment-dialog-title"');
    const dialog = mocks.modal.mock.calls[0][0];
    expect(dialog.isOpen).toBe(true);
    expect(dialog.canClose).toBe(true);
    dialog.onClose();
    expect(mocks.flush).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  });

  it('keeps the dialog open when its pending save fails', async () => {
    mocks.flush.mockRejectedValue(new Error('Offline'));
    renderEditor();
    mocks.modal.mock.calls[0][0].onClose();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([true, false])('closes before navigating to an existing/new project (existing=%s)', async (exists) => {
    const events: string[] = [];
    mocks.flush.mockImplementation(async () => { events.push('saved'); });
    mocks.close.mockImplementation(() => events.push('closed'));
    mocks.push.mockImplementation(() => events.push('navigated'));
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: exists ? [{ id: 'project-a' }] : [] }));
    if (!exists) fetchMock.mockResolvedValueOnce(Response.json({ data: { id: 'project-a' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    const create = mocks.buttons.find((button) => button.icon === 'layout-dashboard');
    await create?.onClick?.();
    expect(events).toEqual(['saved', 'closed', 'navigated']);
    expect(mocks.push).toHaveBeenCalledWith('/projetos/project-a');
    expect(fetchMock).toHaveBeenCalledTimes(exists ? 1 : 2);
  });
});
