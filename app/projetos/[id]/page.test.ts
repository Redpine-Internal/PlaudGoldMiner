import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http';

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  buttons: [] as Array<{ disabled?: boolean; onClick?: () => void }>,
}));
vi.mock('swr', () => ({ default: mocks.swr }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'project-1' }), useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ds', () => ({
  Button: (props: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) => {
    mocks.buttons.push(props);
    return createElement('button', { disabled: props.disabled }, props.children);
  },
  EmptyState: ({ title, message }: { title: string; message: string }) => createElement('div', null, createElement('h1', null, title), createElement('p', null, message)),
  Markdown: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

import ProjetoPage from '@/app/projetos/[id]/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buttons.length = 0;
  mocks.swr.mockReturnValue({ data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutate });
});

describe('Project board load states', () => {
  it.each([new ApiError('Missing', 404), new ApiError('Failed', 500), new TypeError('Network')])('offers working retry and navigation after an initial error: %s', (error) => {
    mocks.swr.mockReturnValue({ data: undefined, error, isLoading: false, isValidating: false, mutate: mocks.mutate });
    const output = renderToStaticMarkup(createElement(ProjetoPage));
    expect(output).toContain('role="alert"');
    expect(output).not.toContain('aria-busy="true"');
    expect(mocks.buttons).toHaveLength(2);
    expect(mocks.buttons[1].disabled).toBe(false);
    mocks.buttons[1].onClick?.();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    mocks.buttons[0].onClick?.();
    expect(mocks.push).toHaveBeenCalledWith('/projetos');
  });

  it('does not loop automatically on 404 but allows transient errors to retry', () => {
    renderToStaticMarkup(createElement(ProjetoPage));
    const config = mocks.swr.mock.calls[0][2];
    expect(config.shouldRetryOnError(new ApiError('Missing', 404))).toBe(false);
    expect(config.shouldRetryOnError(new ApiError('Failed', 503))).toBe(true);
  });

  it('renders loading only while a request is pending', () => {
    mocks.swr.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: mocks.mutate });
    const output = renderToStaticMarkup(createElement(ProjetoPage));
    expect(output).toContain('aria-busy="true"');
    expect(output).not.toContain('role="alert"');
    expect(mocks.buttons).toHaveLength(0);
  });

  it('keeps an actionable empty state if a successful response contains no board', () => {
    mocks.swr.mockReturnValue({ data: {}, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutate });
    const output = renderToStaticMarkup(createElement(ProjetoPage));
    expect(output).toContain('role="alert"');
    expect(mocks.buttons).toHaveLength(2);
    expect(output).not.toContain('aria-busy="true"');
  });
});
