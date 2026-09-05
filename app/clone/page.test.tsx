import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloneMsg } from '@/stores/appStore';

const mocks = vi.hoisted(() => ({ messages: [] as CloneMsg[], mobile: false }));
vi.mock('swr', () => ({ default: () => ({ data: { data: [], total: 0 } }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({
  chats: [{ id: 1, title: 'Chat salvo', seed: null, msgs: mocks.messages }],
  activeChatId: 1, saveChatMsgs: vi.fn(), newChat: vi.fn(), selectChat: vi.fn(),
}) }));
vi.mock('@/components/ds', async () => ({
  Icon: () => null,
  Markdown: (await import('@/components/ds/Markdown')).Markdown,
}));

import ClonePage from '@/app/clone/page';

beforeEach(() => { mocks.messages = []; mocks.mobile = false; });

describe('limite do histórico do Clone', () => {
  it.each([false, true])('identifica o histórico da sessão e explica sua perda ao recarregar (mobile=%s)', (mobile) => {
    mocks.mobile = mobile;
    const html = renderToStaticMarkup(<ClonePage />);
    expect(html).toContain('aria-label="Histórico desta sessão"');
    expect(html).toContain('<p>Histórico desta sessão</p>');
    if (mobile) expect(html).toContain('<span class="sr-only">Histórico desta sessão</span>');
    expect(html).toContain('O histórico é mantido enquanto você navega. Recarregar ou fechar a página apaga estas conversas do chat.');
    expect(html).not.toContain('Histórico do Clone');
  });
});

describe('respostas Markdown do Clone', () => {
  it('mostra negrito e listas usando o renderizador existente e preserva o texto bruto do histórico', () => {
    const raw = '**Prioridades**\n\n- **Primeira:** revisar a conversa\n- Segunda: preparar a proposta\n\n1. Validar\n2. Executar';
    mocks.messages = [{ role: 'user', text: 'Quais são as prioridades?' }, { role: 'clone', text: raw }];
    const html = renderToStaticMarkup(<ClonePage />);
    expect(html).toMatch(/<strong[^>]*>Prioridades<\/strong>/);
    expect(html).toMatch(/<li[^>]*><strong[^>]*>Primeira:<\/strong> revisar a conversa<\/li>/);
    expect(html).toMatch(/<li[^>]*>Validar<\/li>/);
    expect(html.match(/<ul /g)).toHaveLength(2);
    expect(html).toContain('[&amp;_ul]:list-disc');
    expect(html).not.toContain('**Prioridades**');
    expect(mocks.messages[1].text).toBe(raw);
    expect(html).toContain('title="Copiar"');
    expect(html).toContain('title="Regenerar esta resposta"');
  });

  it('mantém a mensagem do usuário literal enquanto formata a resposta do Clone', () => {
    mocks.messages = [{ role: 'user', text: '**Meu texto literal**' }, { role: 'clone', text: '**Resposta formatada**' }];
    const html = renderToStaticMarkup(<ClonePage />);
    expect(html).toContain('**Meu texto literal**');
    expect(html).toMatch(/<strong[^>]*>Resposta formatada<\/strong>/);
  });

  it('escapa HTML e mantém links javascript como texto sem criar conteúdo executável', () => {
    mocks.messages = [{ role: 'clone', text: '<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n[abrir](javascript:alert(3))' }];
    const html = renderToStaticMarkup(<ClonePage />);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('[abrir](javascript:alert(3))');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src="x"');
    expect(html).not.toMatch(/href=["']javascript:/i);
  });
});
