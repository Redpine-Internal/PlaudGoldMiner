import { describe, expect, it } from 'vitest';
import {
  formatContentStatus,
  formatConversationStatus,
  formatConversationType,
  formatEnrichmentSourceType,
  formatLabel,
  formatOpportunityStatus,
  formatProjectTaskKind,
} from './labels';

describe('rótulos de interface em português', () => {
  it('aplica capitalização e acentuação aos códigos conhecidos', () => {
    expect(formatConversationType('reuniao')).toBe('Reunião');
    expect(formatConversationStatus('processado')).toBe('Processado');
    expect(formatOpportunityStatus('analise')).toBe('Em análise');
    expect(formatContentStatus('em_revisao')).toBe('Em revisão');
    expect(formatProjectTaskKind('ai:conteudo')).toBe('Conteúdo');
    expect(formatEnrichmentSourceType('opportunity')).toBe('Novo negócio');
  });

  it('humaniza códigos desconhecidos sem inventar tradução', () => {
    expect(formatLabel('aguardando_aprovacao', {})).toBe('Aguardando aprovacao');
  });

  it('não produz texto para valor ausente', () => {
    expect(formatConversationType(null)).toBe('');
  });
});
