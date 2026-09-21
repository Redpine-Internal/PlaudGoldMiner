import { describe, it, expect, vi, afterEach } from 'vitest';
import { anchorEvidence, buildCandidates, MAX_CANDIDATES, type AnchorDeps } from './evidence-anchor';
import * as selector from './evidence-selector';
import * as client from '../typesafe-client';

const TRANSCRICAO = [
  'Speaker 1: Bom dia. Queria entender como vocês controlam a documentação dos prestadores que entram na planta.',
  'Speaker 2: Então, a gente sofre com isso todo mês. O prestador chega na portaria e ninguém confere se o treinamento está válido.',
  'Speaker 2: Semana passada entrou um rapaz sem NR-35 e a gente só descobriu quando ele já estava no telhado.',
  'Speaker 1: Entendi. E existe algum sistema que registre isso hoje?',
  'Speaker 2: É planilha. Cada área tem a sua e ninguém cruza nada.',
].join('\n');

const DOR = 'Falta de controle sobre a validade dos treinamentos dos prestadores terceirizados.';
const PARAFRASE = 'Ausência de verificação documental de terceiros no acesso à planta.';

/** Conta palavras em comum — imita o ranqueamento léxico real, sem depender dele. */
const rank: AnchorDeps['rank'] = (_t, phrase, window) => {
  const palavras = new Set(phrase.toLowerCase().split(/[^a-zá-ú0-9]+/).filter((w) => w.length > 3));
  const hay = window.toLowerCase();
  return [...palavras].filter((p) => hay.includes(p)).length;
};

const deps = (over: Partial<AnchorDeps> = {}): AnchorDeps => ({
  fallback: () => null,
  rank,
  ...over,
});

const comChave = () => vi.spyOn(client, 'isTypeSafeConfigured').mockReturnValue(true);
const semChave = () => vi.spyOn(client, 'isTypeSafeConfigured').mockReturnValue(false);

afterEach(() => vi.restoreAllMocks());

describe('buildCandidates', () => {
  it('produz janelas ranqueadas e identificadas', () => {
    const c = buildCandidates(TRANSCRICAO, (w) => rank('', DOR, w));
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].id).toBe('L001');
    expect(c.every((x) => x.text.length > 0)).toBe(true);
  });

  it('respeita o teto de candidatos', () => {
    const longa = Array.from({ length: 200 }, (_, i) => `Frase número ${i} sobre treinamento de prestadores na planta.`).join(' ');
    const c = buildCandidates(longa, () => 5);
    expect(c.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it('descarta janelas sem nenhuma afinidade', () => {
    expect(buildCandidates(TRANSCRICAO, () => 0)).toEqual([]);
  });

  it('transcrição vazia não produz candidatos', () => {
    expect(buildCandidates('', () => 1)).toEqual([]);
    expect(buildCandidates('curto', () => 1)).toEqual([]);
  });
});

describe('anchorEvidence', () => {
  it('confirma a passagem que o julgamento escolheu', async () => {
    comChave();
    vi.spyOn(selector, 'selectEvidence').mockResolvedValue({
      kind: 'found',
      candidateId: 'L001',
      text: 'a gente sofre com isso todo mês',
      confidence: 0.8,
    });

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps());

    expect(r.fromTranscription).toBe(true);
    expect(r.excerpt).toBe('a gente sofre com isso todo mês');
    expect(r.reason).toBeUndefined();
  });

  it('recusa a pergunta do consultor mesmo quando a heurística a aceitaria', async () => {
    comChave();
    // Este é o erro que motivou o serviço: a heurística devolve a pergunta,
    // porque ela contém as mesmas palavras-chave da dor.
    const fallback = () => 'E existe algum sistema que registre isso hoje?';
    vi.spyOn(selector, 'selectEvidence').mockResolvedValue({ kind: 'none', reason: 'e-pergunta' });

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps({ fallback }));

    expect(r.fromTranscription).toBe(false);
    expect(r.excerpt).toBe(PARAFRASE);
    expect(r.reason).toBe('e-pergunta');
  });

  it('não confirma quando nenhuma passagem relata a dor', async () => {
    comChave();
    vi.spyOn(selector, 'selectEvidence').mockResolvedValue({ kind: 'none', reason: 'nao-existe' });

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps());

    expect(r.fromTranscription).toBe(false);
    expect(r.excerpt).toBe(PARAFRASE);
  });

  it('não confirma quando nenhuma passagem se destaca', async () => {
    comChave();
    vi.spyOn(selector, 'selectEvidence').mockResolvedValue({ kind: 'none', reason: 'baixa-confianca' });

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps());

    expect(r.fromTranscription).toBe(false);
    expect(r.reason).toBe('baixa-confianca');
  });

  it('sem TypeSafe configurado, mantém o comportamento anterior', async () => {
    semChave();
    const spy = vi.spyOn(selector, 'selectEvidence');
    const fallback = () => 'a gente sofre com isso todo mês';

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps({ fallback }));

    expect(spy).not.toHaveBeenCalled();
    expect(r.fromTranscription).toBe(true);
    expect(r.excerpt).toBe('a gente sofre com isso todo mês');
  });

  it('julgamento indisponível preserva o acerto da heurística', async () => {
    comChave();
    vi.spyOn(selector, 'selectEvidence').mockResolvedValue({
      kind: 'unavailable',
      reason: 'timeout',
    });
    const fallback = () => 'a gente sofre com isso todo mês';

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps({ fallback }));

    expect(r.fromTranscription).toBe(true);
    expect(r.reason).toBe('indisponivel');
  });

  it('exceção no julgamento não derruba a ancoragem', async () => {
    comChave();
    vi.spyOn(selector, 'selectEvidence').mockRejectedValue(new Error('rede caiu'));

    const r = await anchorEvidence(DOR, PARAFRASE, TRANSCRICAO, deps());

    expect(r.fromTranscription).toBe(false);
    expect(r.excerpt).toBe(PARAFRASE);
    expect(r.reason).toBe('indisponivel');
  });

  it('transcrição sem candidatos não vai ao julgamento', async () => {
    comChave();
    const spy = vi.spyOn(selector, 'selectEvidence');

    const r = await anchorEvidence(DOR, PARAFRASE, '', deps());

    expect(spy).not.toHaveBeenCalled();
    expect(r.fromTranscription).toBe(false);
    expect(r.reason).toBe('sem-candidatos');
  });
});
