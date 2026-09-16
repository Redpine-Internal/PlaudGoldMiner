import { describe, expect, it } from 'vitest';
import { summaryExcerpt, topicsExcerpt, conversationExcerpt } from '@/lib/presentation/summary-excerpt';

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

describe('prévia por tópicos', () => {
  it('junta os tópicos de conteúdo, descartando os protocolares', () => {
    const topics = JSON.stringify([
      'Abertura da Reunião',
      'Desafio de Segurança',
      'Abordagem e Ferramentas',
      'Foco em Riscos Críticos',
    ]);
    expect(topicsExcerpt(topics)).toBe(
      'Desafio de Segurança · Abordagem e Ferramentas · Foco em Riscos Críticos',
    );
  });

  it('descarta cumprimento e teste de áudio em espanhol', () => {
    const topics = JSON.stringify([
      'Saludo y prueba audio',
      'Problemas informe e idioma',
      'Detalles de errores y decisión de cortar',
    ]);
    expect(topicsExcerpt(topics)).toBe(
      'Problemas informe e idioma · Detalles de errores y decisión de cortar',
    );
  });

  it('devolve vazio quando não há tópico aproveitável', () => {
    expect(topicsExcerpt(JSON.stringify(['Abertura', 'Encerramento']))).toBe('');
    expect(topicsExcerpt('[]')).toBe('');
    expect(topicsExcerpt('não é json')).toBe('');
    expect(topicsExcerpt(null)).toBe('');
  });

  it('prefere os tópicos ao resumo e recorre ao resumo quando não há tópicos', () => {
    const topics = JSON.stringify(['Cultura com Terceiros']);
    const summary = '## Informações da reunião\n\nA conversa tratou de segurança.';
    expect(conversationExcerpt(topics, summary)).toBe('Cultura com Terceiros');
    expect(conversationExcerpt(null, summary)).toBe('A conversa tratou de segurança.');
    expect(conversationExcerpt('[]', '> **Fecha:** 2026-09-14')).toBe('');
  });
});
