import { describe, expect, it } from 'vitest';
import { conversationSelectionUrl, toggleConversationSelection } from '@/components/ds/GenerateBusinessModal';

describe('seleção de conversas para detectar negócios', () => {
  it('busca no servidor além das primeiras cem conversas, com os filtros de elegibilidade', () => {
    const url = new URL(conversationSelectionUrl(8, 'Segurança & gestão'), 'http://localhost');
    expect(url.pathname).toBe('/api/conversations');
    expect(url.searchParams.get('offset')).toBe('140');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('search')).toBe('Segurança & gestão');
    expect(url.searchParams.get('status')).toBe('processado');
    expect(url.searchParams.get('content')).toBe('hasTranscription');
  });

  it('preserva escolhas de outras páginas e permite removê-las ao retornar', () => {
    const firstPage = toggleConversationSelection([], 'pagina-1', false);
    const anotherPage = toggleConversationSelection(firstPage, 'pagina-8', false);
    expect(anotherPage).toEqual(['pagina-1', 'pagina-8']);
    expect(toggleConversationSelection(anotherPage, 'pagina-1', false)).toEqual(['pagina-8']);
    expect(firstPage).toEqual(['pagina-1']);
  });

  it('mantém o limite total de quarenta entre páginas, mas permite trocar uma escolha', () => {
    const picked = Array.from({ length: 40 }, (_, index) => `conversa-${index}`);
    expect(toggleConversationSelection(picked, 'outra-pagina', false)).toEqual(picked);
    const removed = toggleConversationSelection(picked, 'conversa-4', false);
    const replaced = toggleConversationSelection(removed, 'outra-pagina', false);
    expect(replaced).toHaveLength(40);
    expect(replaced).toContain('outra-pagina');
    expect(replaced).not.toContain('conversa-4');
  });

  it('mantém uma única escolha no modo de conversa única, mesmo ao trocar de página', () => {
    expect(toggleConversationSelection(['pagina-1'], 'pagina-8', true)).toEqual(['pagina-8']);
    expect(toggleConversationSelection(['pagina-8'], 'pagina-8', true)).toEqual([]);
  });
});
