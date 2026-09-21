import { describe, it, expect } from 'vitest';
import {
  perConversationChars,
  trimToBudget,
  CONV_BUDGET_SHARE,
  MIN_CONV_CHARS,
} from './context-budget';

/**
 * O bug que estes testes travam: o Clone tinha 169 oportunidades no banco e
 * respondia como se não houvesse nenhuma. O bloco de conversas consumia o
 * orçamento inteiro e o corte final, que tirava do fim do texto, apagava a
 * seção de oportunidades — sem erro, sem log, sem sinal na tela.
 */

const BUDGET = 6000;
const MAX_CHARS = BUDGET * 3.5;

describe('perConversationChars', () => {
  it('mantém o bloco de conversas dentro da sua fatia com 40 conversas', () => {
    // O caso real: buildContext busca 40 conversas.
    const per = perConversationChars(BUDGET, 40);
    const blocoTotal = per * 40;

    expect(blocoTotal).toBeLessThanOrEqual(MAX_CHARS * CONV_BUDGET_SHARE);
    // A fórmula antiga dava 600 (piso vencia os 525 calculados) e o bloco
    // ficava em 24.000 chars contra um teto de 21.000.
    expect(blocoTotal).toBeLessThan(24_000);
  });

  it('deixa espaço para as outras seções em qualquer volume', () => {
    for (const n of [1, 5, 10, 20, 40, 100]) {
      const blocoTotal = perConversationChars(BUDGET, n) * n;
      // Com muitas conversas o piso passa a valer e o bloco pode crescer —
      // aí quem protege é trimToBudget. Até 40 (o limite real da query), a
      // fatia tem de ser respeitada.
      if (n <= 40) {
        expect(blocoTotal).toBeLessThanOrEqual(MAX_CHARS * CONV_BUDGET_SHARE);
      }
    }
  });

  it('dá resumos longos quando há poucas conversas', () => {
    expect(perConversationChars(BUDGET, 2)).toBeGreaterThan(1000);
  });

  it('nunca desce abaixo do piso legível', () => {
    expect(perConversationChars(BUDGET, 1000)).toBe(MIN_CONV_CHARS);
  });
});

describe('trimToBudget', () => {
  const conversas = (chars: number) => 'CONVERSAS (40):\n' + 'c'.repeat(chars);
  const oportunidades = 'OPORTUNIDADES (30):\n- "Gestão de terceiros" (score 94)';

  it('devolve o contexto intacto quando cabe', () => {
    const parts = ['SOBRE O USUÁRIO:\nbio', conversas(1000), oportunidades];
    const out = trimToBudget(parts, BUDGET);

    expect(out).toContain('OPORTUNIDADES');
    expect(out).not.toContain('truncad');
  });

  it('PRESERVA as oportunidades quando estoura — o bug original', () => {
    // Bloco de conversas gigante: o corte do fim apagaria as oportunidades.
    const parts = [conversas(Math.floor(MAX_CHARS)), oportunidades];
    const out = trimToBudget(parts, BUDGET);

    expect(out).toContain('OPORTUNIDADES');
    expect(out).toContain('Gestão de terceiros');
    expect(out).toContain('conversas truncadas');
  });

  it('respeita o teto depois de cortar', () => {
    const parts = [conversas(Math.floor(MAX_CHARS * 2)), oportunidades];
    const out = trimToBudget(parts, BUDGET);

    // A marca de truncagem soma alguns chars; o que importa é não estourar a
    // cota de forma significativa.
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS + 100);
  });

  it('acha o bloco pelo cabeçalho, não pela posição', () => {
    // Uma seção nova antes das conversas não pode desviar o corte.
    const parts = ['SEÇÃO NOVA:\nqualquer coisa', conversas(Math.floor(MAX_CHARS)), oportunidades];
    const out = trimToBudget(parts, BUDGET);

    expect(out).toContain('SEÇÃO NOVA');
    expect(out).toContain('OPORTUNIDADES');
  });

  it('cai no corte cego quando não há bloco de conversas', () => {
    const parts = ['OUTRA COISA:\n' + 'x'.repeat(Math.floor(MAX_CHARS * 2))];
    const out = trimToBudget(parts, BUDGET);

    expect(out).toContain('contexto truncado');
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS + 100);
  });
});
