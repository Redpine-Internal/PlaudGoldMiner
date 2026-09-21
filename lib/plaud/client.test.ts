import { describe, it, expect } from 'vitest';
import { __testing } from './client';

const { parseTranscript } = __testing;

/**
 * A transcrição perdia o falante: o Plaud entrega `speaker` por trecho e a
 * montagem usava só o `content`. Sem essa marca não se distingue o cliente
 * relatando a própria dor do consultor perguntando sobre ela — sinais opostos
 * para a mineração, e a origem do viés que trouxe 27 palestras para dentro da
 * análise como se fossem conversas de cliente.
 */

const seg = (content: string, speaker?: string | number) => ({ content, speaker });

describe('parseTranscript', () => {
  it('preserva quem falou cada trecho', () => {
    const out = parseTranscript(
      JSON.stringify([seg('Bom dia', 'Speaker 1'), seg('Oi, tudo bem?', 'Speaker 2')])
    );

    expect(out).toContain('Speaker 1: Bom dia');
    expect(out).toContain('Speaker 2: Oi, tudo bem?');
  });

  it('junta trechos consecutivos do mesmo falante num turno só', () => {
    // A alternância é o que importa; um turno picado em cinco linhas não
    // acrescenta nada e infla a transcrição.
    const out = parseTranscript(
      JSON.stringify([
        seg('A gente tem dificuldade', 'Speaker 2'),
        seg('com os terceiros.', 'Speaker 2'),
        seg('Entendi.', 'Speaker 1'),
      ])
    );

    expect(out).toContain('Speaker 2: A gente tem dificuldade com os terceiros.');
    expect(out.match(/Speaker 2:/g)).toHaveLength(1);
  });

  it('normaliza falante numérico para rótulo estável', () => {
    expect(parseTranscript(JSON.stringify([seg('oi', 1)]))).toContain('Speaker 1: oi');
  });

  it('mantém o texto sem prefixo quando não há falante', () => {
    // Gravações antigas e transcrições de outras origens não têm o campo;
    // inventar "Speaker 1" ali seria afirmar o que não se sabe.
    const out = parseTranscript(JSON.stringify([seg('texto solto'), seg('outro')]));

    expect(out).toBe('texto solto\n\noutro');
    expect(out).not.toContain('Speaker');
  });

  it('ignora trechos vazios sem quebrar a sequência de turnos', () => {
    const out = parseTranscript(
      JSON.stringify([seg('  ', 'Speaker 1'), seg('olá', 'Speaker 2')])
    );

    expect(out).toBe('Speaker 2: olá');
  });

  it('devolve o texto cru quando não é JSON', () => {
    expect(parseTranscript('transcrição em texto corrido')).toBe('transcrição em texto corrido');
  });

  it('devolve o texto cru quando o JSON não é um array', () => {
    expect(parseTranscript('{"texto":"x"}')).toBe('{"texto":"x"}');
  });
});
