import { describe, it, expect } from 'vitest';
import { detectPresentation } from './presentation-detector';

/**
 * Casos tirados do acervo real. 27 gravações da consultora apresentando tinham
 * sido mineradas como se fossem conversa de cliente, e a análise devolvia como
 * "oportunidade detectada" o discurso dela própria.
 */

describe('detecta apresentação da consultora', () => {
  it('reconhece "Instrutora: Andresa" no resumo', () => {
    const r = detectPresentation(
      '07-16 Palestra: Transformação da Cultura de Segurança',
      'Data e hora: 2026-07-16 Local: [Inserir Local] Instrutora: Andresa Resumo A série…'
    );
    expect(r.isPresentation).toBe(true);
    expect(r.reason).toBe('instrutora-nomeada');
  });

  it('reconhece a grafia alternativa "Andressa"', () => {
    const r = detectPresentation(
      '05-14 Reunião: Estratégia',
      'Instrutor(a): Jaques, Andressa ## Resumo…'
    );
    // Título de reunião, mas instrutora nomeada — a marca do resumo é mais forte?
    // Não: "Reunião" vence, porque o cliente pode citar a instrutora numa reunião.
    expect(r.isPresentation).toBe(false);
  });

  it('reconhece título de palestra sem marca no resumo', () => {
    const r = detectPresentation('03-18 Palestra: Liderança em Segurança', null);
    expect(r.isPresentation).toBe(true);
    expect(r.reason).toBe('titulo-palestra');
  });

  it('reconhece título de treinamento', () => {
    const r = detectPresentation('01-20 Treinamento: Liderança em Segurança Operacional', '');
    expect(r.isPresentation).toBe(true);
    expect(r.reason).toBe('titulo-palestra');
  });

  it('reconhece workshop em minúsculas ("ws liderança")', () => {
    const r = detectPresentation('2025-11-26 09:09:54 ws liderança em segurança - parte 1', null);
    expect(r.isPresentation).toBe(true);
    expect(r.reason).toBe('workshop');
  });

  it('reconhece "WS AXIA Belém"', () => {
    const r = detectPresentation('12-05 WS AXIA Belém - parte 1: Liderança', null);
    expect(r.isPresentation).toBe(true);
    expect(r.reason).toBe('workshop');
  });
});

describe('preserva conversas legítimas de cliente', () => {
  it('mantém reunião SOBRE treinamento — é o cliente dizendo que precisa', () => {
    const r = detectPresentation('09-08 Reunião: Planejamento de Treinamentos de Segurança', null);
    expect(r.isPresentation).toBe(false);
  });

  it('mantém reunião de alinhamento para workshop', () => {
    const r = detectPresentation('09-08 Reunião: Alinhamento para Workshop de CAPEX', null);
    expect(r.isPresentation).toBe(false);
  });

  it('mantém "Meeting: SIF Prevention Workshop"', () => {
    const r = detectPresentation('03-04 Meeting: Serious Injury and Fatality Prevention Workshop', null);
    expect(r.isPresentation).toBe(false);
  });

  it('ignora placeholder "[Inserir Nome]" não preenchido', () => {
    const r = detectPresentation('08-04 Reunião Semanal: Padronização', 'Instrutor: [Inserir Nome]');
    expect(r.isPresentation).toBe(false);
  });

  it('ignora instrutor que não é a consultora', () => {
    const r = detectPresentation('05-20 Encontro técnico', 'Instrutor(a): Marcos Tanaka');
    expect(r.isPresentation).toBe(false);
  });

  it('mantém entrevista e consulta com cliente', () => {
    expect(detectPresentation('01-22 Entrevista: Cultura de Segurança', null).isPresentation).toBe(false);
    expect(detectPresentation('08-07 Consulta: Cultura Proativa em P&D', null).isPresentation).toBe(false);
  });

  it('lida com título e resumo vazios', () => {
    expect(detectPresentation(null, null).isPresentation).toBe(false);
    expect(detectPresentation('', '').isPresentation).toBe(false);
  });

  it('não confunda palavras que contêm "ws"', () => {
    const r = detectPresentation('04-10 Reunião: news e alinhamento', null);
    expect(r.isPresentation).toBe(false);
  });
});
