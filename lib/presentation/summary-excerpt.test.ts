import { describe, expect, it } from 'vitest';
import { summaryExcerpt } from '@/lib/presentation/summary-excerpt';

describe('summaryExcerpt', () => {
  it('descarta o cabeçalho de metadados que vazava na lista de conversas', () => {
    const raw = '> **Fecha:** 2026-09-14 09:00:05\n> **Ubicación:** Sala 3\n\nA equipe alinhou o cronograma do piloto com o cliente.';
    expect(summaryExcerpt(raw)).toBe('A equipe alinhou o cronograma do piloto com o cliente.');
  });

  it('pula o título "Informações da reunião" e a data logo abaixo', () => {
    const raw = '## Informações da reunião\n> Data: 2026-08-19 09:00\n\nRevisão do contrato de manutenção anual.';
    expect(summaryExcerpt(raw)).toBe('Revisão do contrato de manutenção anual.');
  });

  it('remove marcação inline sem perder o texto', () => {
    expect(summaryExcerpt('- **Decisão:** seguir com o [fornecedor atual](https://x.test)'))
      .toBe('Decisão: seguir com o fornecedor atual');
  });

  it('trunca no limite sem cortar palavra ao meio', () => {
    const excerpt = summaryExcerpt('palavra '.repeat(60), { maxLength: 40 });
    expect(excerpt.length).toBeLessThanOrEqual(40);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/palav…$/);
  });

  it('devolve vazio quando só há metadados, para a linha omitir a prévia', () => {
    expect(summaryExcerpt('## Informações da reunião\n> **Fecha:** 2026-09-14\n> **Participantes:** Ana, Bruno')).toBe('');
    expect(summaryExcerpt('')).toBe('');
    expect(summaryExcerpt(null)).toBe('');
    expect(summaryExcerpt(undefined)).toBe('');
  });

  it('ignora blocos de código e linhas horizontais', () => {
    expect(summaryExcerpt('---\n```\nlog bruto\n```\nConclusão prática do encontro.'))
      .toBe('Conclusão prática do encontro.');
  });
});
