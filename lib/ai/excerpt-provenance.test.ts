import { describe, it, expect } from 'vitest';
import { marcarProcedencia, lerProcedencia } from './excerpt-provenance';

/**
 * O marcador de procedência é gravado no banco e lido de volta. O que importa
 * aqui é o par ida-e-volta: o texto que chega à tela precisa ser exatamente o
 * texto original, e a marca não pode vazar para o usuário.
 */

describe('marcarProcedencia', () => {
  it('prefixa o trecho que veio da transcrição', () => {
    const marcado = marcarProcedencia('a máquina parou de novo', true);

    expect(marcado).not.toBe('a máquina parou de novo');
    expect(marcado).toContain('a máquina parou de novo');
  });

  it('deixa intacto o trecho que veio do resumo', () => {
    expect(marcarProcedencia('Causas Raiz Preliminares', false)).toBe('Causas Raiz Preliminares');
  });

  it('não inventa texto quando não há trecho', () => {
    expect(marcarProcedencia(null, true)).toBeNull();
    expect(marcarProcedencia('', true)).toBe('');
  });
});

describe('lerProcedencia', () => {
  it('devolve o texto sem a marca e sinaliza que é fala', () => {
    const { texto, daTranscricao } = lerProcedencia(marcarProcedencia('o operador reclamou', true));

    // A marca é detalhe de armazenamento; a tela recebe o texto puro.
    expect(texto).toBe('o operador reclamou');
    expect(daTranscricao).toBe(true);
  });

  it('trata trecho sem marca como não confirmado', () => {
    const { texto, daTranscricao } = lerProcedencia('Falhas de Ancoragem e APR');

    expect(texto).toBe('Falhas de Ancoragem e APR');
    expect(daTranscricao).toBe(false);
  });

  it('lê os 91 trechos antigos, gravados antes do marcador, como não confirmados', () => {
    // Retrocompatibilidade: nenhum registro anterior tem o prefixo, e o padrão
    // seguro é não citar — uma citação a menos, nunca uma citação falsa.
    const antigo = 'trecho gravado quando ainda não havia procedência';

    expect(lerProcedencia(antigo)).toEqual({ texto: antigo, daTranscricao: false });
  });

  it('preserva texto que por acaso começa com colchete', () => {
    // O modelo às vezes abre o excerpt com uma anotação entre colchetes; isso
    // não pode ser confundido com a marca nem ser comido na leitura.
    const { texto, daTranscricao } = lerProcedencia('[inaudível] o supervisor confirmou');

    expect(texto).toBe('[inaudível] o supervisor confirmou');
    expect(daTranscricao).toBe(false);
  });

  it('aceita nulo sem quebrar', () => {
    expect(lerProcedencia(null)).toEqual({ texto: null, daTranscricao: false });
  });
});
