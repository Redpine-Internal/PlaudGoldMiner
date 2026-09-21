import { describe, it, expect } from 'vitest';
import {
  themeWeight,
  formatThemeWindow,
  formatMarket,
  type ThemeBoardTheme,
  type ThemeBoardItem,
} from './ThemeBoard';

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

/**
 * A janela do tema responde "isto está crescendo ou esfriando?" — a pergunta
 * que decide perseguir. Recorrência sem data não diz se é de agora ou de seis
 * meses atrás.
 */
describe('formatThemeWindow', () => {
  it('mostra desde quando e a última menção', () => {
    const out = formatThemeWindow('2026-06-17', '2026-09-14');
    expect(out).toContain('desde');
    expect(out).toContain('14/09');
  });

  it('colapsa para uma data só quando o tema tem um dia só', () => {
    expect(formatThemeWindow('2026-09-02', '2026-09-02')).toBe('em 02/09');
  });

  it('funciona com só uma das pontas', () => {
    expect(formatThemeWindow(null, '2026-09-14')).toContain('14/09');
    expect(formatThemeWindow('2026-06-17', null)).toContain('desde');
  });

  it('devolve null sem datas — a tela então não mostra nada', () => {
    expect(formatThemeWindow(null, null)).toBeNull();
    expect(formatThemeWindow(undefined, undefined)).toBeNull();
  });

  it('ignora data inválida em vez de imprimir "Invalid Date"', () => {
    expect(formatThemeWindow('nao-e-data', null)).toBeNull();
  });

  it('não desloca o dia por fuso — 01/09 continua 01/09', () => {
    // Data pura (sem hora) é UTC; formatar em horário local puxaria para 31/08.
    expect(formatThemeWindow(null, '2026-09-01')).toContain('01/09');
  });
});

describe('contagem de negócios do tema', () => {
  it('conta os negócios do TEMA, não os da página aberta', () => {
    // O card dizia "2 negócios" num tema de 48 porque contava `members`, que só
    // tem os itens paginados. O total vem de `opportunityIds`, que o servidor
    // devolve inteiro.
    const t = tema({ opportunityIds: ['a', 'b', 'c', 'd'], conversationCount: 34 });
    const naPagina = [item('a', 80), item('b', 70)];

    expect(t.opportunityIds.length).toBe(4);
    expect(naPagina.length).toBe(2);
  });
});

/**
 * A leitura de mercado entra na decisão ao lado da recorrência: um tema muito
 * citado cujo mercado já tem as grandes consultorias é disputa cara; um tema
 * menos citado sem especialista é campo aberto.
 */
describe('formatMarket', () => {
  it('não mostra nada quando o mercado nunca foi medido', () => {
    expect(formatMarket(tema())).toBeNull();
  });

  it('separa mercado formado COM e SEM as grandes consultorias', () => {
    // Mesmo nível de saturação, decisões opostas.
    const comGrandes = formatMarket(tema({ marketSaturation: 2, marketBigPlayers: 0.9 }));
    const semGrandes = formatMarket(tema({ marketSaturation: 2, marketBigPlayers: 0.1 }));

    expect(comGrandes?.livre).toBe(false);
    expect(semGrandes?.livre).toBe(true);
    expect(semGrandes?.texto).toContain('sem as grandes');
  });

  it('marca campo aberto quando ninguém foi encontrado', () => {
    const r = formatMarket(tema({ marketSaturation: 0, marketBigPlayers: 0 }));
    expect(r?.livre).toBe(true);
    expect(r?.texto).toBe('ninguém oferece');
  });

  it('pede conferência quando a busca só achou conteúdo', () => {
    // Confundir "a busca não achou fornecedor" com "não existe fornecedor"
    // faria a tela recomendar um tema pelo motivo errado.
    const r = formatMarket(tema({ marketSaturation: 0, marketContentOnly: true }));
    expect(r?.texto).toContain('conferir');
    expect(r?.livre).toBe(false);
  });

  it('marca consolidado e disputado como não livre', () => {
    const r = formatMarket(tema({ marketSaturation: 3, marketBigPlayers: 0.95 }));
    expect(r?.livre).toBe(false);
    expect(r?.texto).toContain('com as grandes');
  });
});
