import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: LoginPage } = await import('@/app/login/page');

describe('LoginPage', () => {
  it('oferece SSO Microsoft e mantém o acesso por senha', () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain('Entrar com Microsoft');
    expect(html).toContain('ou use sua senha');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
  });
});
