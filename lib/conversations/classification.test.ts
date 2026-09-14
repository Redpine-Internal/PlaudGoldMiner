import { describe, expect, it } from 'vitest';
import {
  isMiningEligibleConversationType,
  miningEligibleSql,
} from '@/lib/conversations/classification';

describe('classificação das gravações para mineração', () => {
  it('inclui reunião interna na inteligência', () => {
    expect(isMiningEligibleConversationType('reuniao_interna')).toBe(true);
  });

  it('mantém treinamento e gravação não classificada fora da inteligência', () => {
    expect(isMiningEligibleConversationType('treinamento')).toBe(false);
    expect(isMiningEligibleConversationType('nao_classificado')).toBe(false);
    expect(isMiningEligibleConversationType('outro')).toBe(false);
  });

  it('gera filtro SQL positivo sem incluir treinamento', () => {
    const sql = miningEligibleSql('c.type');
    expect(sql).toContain("'reuniao_interna'");
    expect(sql).toContain("'reuniao_comercial'");
    expect(sql).not.toContain("'treinamento'");
    expect(sql).not.toContain("'nao_classificado'");
  });
});
