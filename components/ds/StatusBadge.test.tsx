import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/ds/StatusBadge';

describe('StatusBadge', () => {
  it('exibe o rótulo integral por padrão', () => {
    const html = renderToStaticMarkup(<StatusBadge status="aguardando_transcricao" />);
    expect(html).toContain('Aguardando transcrição do Plaud');
    expect(html).not.toContain('title=');
    expect(html).not.toContain('aria-label=');
  });

  it('usa a forma curta em contexto estreito sem perder o significado', () => {
    const html = renderToStaticMarkup(<StatusBadge status="aguardando_transcricao" short />);
    expect(html).toContain('Sem transcrição');
    // Resumir sem remover: o texto integral continua acessível.
    expect(html).toContain('title="Aguardando transcrição do Plaud"');
    expect(html).toContain('aria-label="Aguardando transcrição do Plaud"');
  });

  it('não altera os demais status nem quando a forma curta é pedida', () => {
    for (const [status, label] of [
      ['processado', 'Processado'],
      ['pendente', 'Pendente'],
      ['processando', 'Processando'],
      ['erro', 'Erro'],
    ] as const) {
      const html = renderToStaticMarkup(<StatusBadge status={status} short />);
      expect(html).toContain(`>${label}</span>`);
      // Sem abreviação não há atributo redundante para leitores de tela.
      expect(html).not.toContain('aria-label=');
    }
  });

  it('mantém a cor de status derivada dos tokens', () => {
    const html = renderToStaticMarkup(<StatusBadge status="aguardando_transcricao" short />);
    expect(html).toContain('var(--status-pendente-bg)');
    expect(html).toContain('var(--status-pendente-fg)');
  });
});
