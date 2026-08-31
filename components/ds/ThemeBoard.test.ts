import { describe, it, expect } from 'vitest';
import { themeWeight, type ThemeBoardTheme, type ThemeBoardItem } from './ThemeBoard';

/**
 * A ordenação dos temas É a recomendação do acessório "decidir o que perseguir".
 * Se ela mudar sem querer, a tela passa a sugerir a coisa errada em silêncio —
 * por isso o peso tem teste próprio, separado da renderização.
 */

const tema = (over: Partial<ThemeBoardTheme> = {}): ThemeBoardTheme => ({
  id: 't',
  name: 'Tema',
  rationale: null,
  updatedAt: '2026-08-31',
  opportunityIds: [],
  conversationCount: 0,
  conversationTitles: [],
  ...over,
});

const item = (id: string, score: number): ThemeBoardItem => ({
  id,
  title: `Negócio ${id}`,
  score,
  type: 'consultoria',
});

describe('themeWeight', () => {
  it('põe na frente o tema que recorre em mais conversas com o mesmo score', () => {
    const items = [item('a', 80), item('b', 80)];
    const muito = themeWeight(tema({ opportunityIds: ['a'], conversationCount: 27 }), items);
    const pouco = themeWeight(tema({ opportunityIds: ['b'], conversationCount: 2 }), items);

    expect(muito).toBeGreaterThan(pouco);
  });

  it('não deixa a recorrência sozinha ganhar de um tema muito melhor', () => {
    // Um assunto citado de passagem em muitas conversas não vale mais que um
    // assunto forte: é o produto dos dois que decide, não a contagem.
    const items = [item('a', 10), item('b', 90)];
    const raso = themeWeight(tema({ opportunityIds: ['a'], conversationCount: 10 }), items);
    const bom = themeWeight(tema({ opportunityIds: ['b'], conversationCount: 5 }), items);

    expect(bom).toBeGreaterThan(raso);
  });

  it('usa a média dos scores, não a soma', () => {
    // Com soma, três negócios fracos passariam à frente de um forte só por
    // serem três. O tema não fica melhor por ter sido fatiado em mais cards.
    const items = [item('a', 30), item('b', 30), item('c', 30), item('d', 85)];
    const muitosFracos = themeWeight(
      tema({ opportunityIds: ['a', 'b', 'c'], conversationCount: 4 }),
      items
    );
    const umForte = themeWeight(tema({ opportunityIds: ['d'], conversationCount: 4 }), items);

    expect(umForte).toBeGreaterThan(muitosFracos);
  });

  it('vale zero quando o tema não tem conversa nenhuma', () => {
    // Sem fonte não há prova de origem; o tema não pode encabeçar a lista.
    expect(themeWeight(tema({ opportunityIds: ['a'], conversationCount: 0 }), [item('a', 99)]))
      .toBe(0);
  });

  it('ignora ids que não estão na página em vez de contá-los como zero', () => {
    // A listagem vem paginada; um membro fora da página não pode derrubar a
    // média do tema e rebaixá-lo por um motivo que não é dele.
    const items = [item('a', 80)];
    const comFantasma = themeWeight(
      tema({ opportunityIds: ['a', 'sumido'], conversationCount: 3 }),
      items
    );

    expect(comFantasma).toBe(3 * 80);
  });
});
