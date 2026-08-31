import { describe, it, expect } from 'vitest';
import { detectarTextoCorrompido } from './text-integrity';

/**
 * A checagem roda antes de gravar o texto gerado. Dois riscos opostos: deixar
 * passar texto quebrado, que fica cacheado para sempre, e rejeitar texto bom,
 * que faz o usuário perder cota da Azure regerando à toa. Os dois lados são
 * testados.
 */

describe('texto que deve ser rejeitado', () => {
  it('pega o caso real: armênio no meio de uma palavra portuguesa', () => {
    // "EPIs կիրառados" — observado em produção, dentro de "aplicados".
    const problema = detectarTextoCorrompido(
      'Programa de gestão de EPIs կիրառados na operação de campo.'
    );

    expect(problema).not.toBeNull();
    expect(problema?.motivo).toContain('alfabeto');
    // O trecho vai para o log; sem ele não dá para investigar a recorrência.
    expect(problema?.trecho).toContain('EPIs');
  });

  it('pega cirílico, grego e CJK', () => {
    expect(detectarTextoCorrompido('treinamento de сегurança')).not.toBeNull();
    expect(detectarTextoCorrompido('consultoria de αnálise de risco')).not.toBeNull();
    expect(detectarTextoCorrompido('implantação de 系统 de gestão')).not.toBeNull();
  });

  it('pega o caractere de substituição de encoding quebrado', () => {
    const problema = detectarTextoCorrompido('auditoria de seguran�a do trabalho');

    expect(problema?.motivo).toContain('encoding');
  });
});

describe('texto que deve passar', () => {
  it('aceita português com toda a acentuação', () => {
    expect(
      detectarTextoCorrompido(
        'Implantação de programa de gestão de EPIs com inspeção mensal, ' +
          'avaliação ergonômica e treinamento em NR-35. Ação corrigida após não conformidade.'
      )
    ).toBeNull();
  });

  it('aceita pontuação, símbolos e números que a IA usa em proposta', () => {
    expect(
      detectarTextoCorrompido(
        'Escopo: 3 módulos — 40h no total. Investimento estimado: R$ 18.500,00 (±10%). ' +
          'Meta: reduzir 30% dos incidentes; prazo de 6 meses. "Piloto" em 1 unidade → expansão.'
      )
    ).toBeNull();
  });

  it('aceita termos técnicos em inglês, que aparecem o tempo todo em EHS', () => {
    expect(
      detectarTextoCorrompido('Aplicação de LOTO (lock out tag out) e near miss reporting.')
    ).toBeNull();
  });

  it('não reclama de texto vazio — quem trata isso é a rota', () => {
    expect(detectarTextoCorrompido('')).toBeNull();
  });
});
