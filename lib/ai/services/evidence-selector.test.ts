import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O trecho que sai daqui aparece entre aspas num card que o operador leva para
 * uma reunião comercial. Citar o que ninguém disse queima a credibilidade do
 * negócio, então a fronteira testada é sempre a mesma: na dúvida, não citar.
 */

const ask = vi.fn();
let configured = true;

vi.mock('../typesafe-client', () => ({
  ask: (...args: unknown[]) => ask(...args),
  isTypeSafeConfigured: () => configured,
  MAX_CHOICE_OPTIONS: 255,
}));

const { selectEvidence, candidateId } = await import('./evidence-selector');

const cands = [
  { id: 'L001', text: 'a gente tem dificuldade de engajar o dono da contratada' },
  { id: 'L002', text: 'e a sua visão sobre terceiros, como funciona?' },
];

/** Resposta do modelo: existência, pergunta-do-consultor e a escolha. */
const responde = (existe: number, ePergunta: number, choice: string, confidence: number) => {
  ask.mockResolvedValue({
    success: true,
    answers: { existe, e_pergunta: ePergunta, onde: { choice, confidence, probabilities: {} } },
  });
};

beforeEach(() => {
  ask.mockReset();
  configured = true;
});

describe('encontra a evidência', () => {
  it('devolve a passagem quando existe, é relato e a escolha é firme', async () => {
    responde(0.9, 0.17, 'L001', 0.92);

    const r = await selectEvidence('dificuldade com terceiros', cands);

    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.candidateId).toBe('L001');
    expect(r.text).toContain('dono da contratada');
  });

  it('manda as três perguntas numa requisição só', async () => {
    responde(0.9, 0.1, 'L001', 0.9);

    await selectEvidence('dor', cands);

    expect(ask).toHaveBeenCalledTimes(1);
    const [, questions] = ask.mock.calls[0];
    expect(Object.keys(questions).sort()).toEqual(['e_pergunta', 'existe', 'onde']);
  });

  it('põe o texto de cada candidato no estado, prefixado pelo id', async () => {
    responde(0.9, 0.1, 'L001', 0.9);

    await selectEvidence('dor', cands);

    const [state] = ask.mock.calls[0];
    expect(state).toContain('L001| a gente tem dificuldade');
    // As opções do Choice não repetem o texto — o estado já o traz.
    const [, questions] = ask.mock.calls[0];
    expect(questions.onde.criteria).toEqual({ L001: null, L002: null });
  });
});

describe('recusa em vez de citar errado', () => {
  it('recusa quando nenhuma passagem relata a dor', async () => {
    // A distribuição do Choice soma 1, então alguma passagem sempre vence;
    // sem o Noul de existência, "nenhuma serve" seria inexprimível.
    responde(0.12, 0.1, 'L001', 0.95);

    const r = await selectEvidence('dor que não está na conversa', cands);

    expect(r.kind).toBe('none');
    if (r.kind !== 'none') return;
    expect(r.reason).toBe('nao-existe');
  });

  it('recusa quando a melhor passagem é o consultor perguntando', async () => {
    // O erro observado no acervo: a pergunta do consultor contém as mesmas
    // palavras-chave da dor e a heurística léxica a escolhe no lugar do relato.
    responde(0.88, 0.81, 'L002', 0.9);

    const r = await selectEvidence('dor', cands);

    expect(r.kind).toBe('none');
    if (r.kind !== 'none') return;
    expect(r.reason).toBe('e-pergunta');
  });

  it('recusa quando nenhuma passagem se destaca', async () => {
    // Distribuição espalhada: a escolha é chute com tipo, e vira citação falsa.
    responde(0.9, 0.1, 'L001', 0.12);

    const r = await selectEvidence('dor', cands);

    expect(r.kind).toBe('none');
    if (r.kind !== 'none') return;
    expect(r.reason).toBe('baixa-confianca');
  });

  it('recusa quando a escolha não é um candidato conhecido', async () => {
    responde(0.9, 0.1, 'L999', 0.9);

    const r = await selectEvidence('dor', cands);

    expect(r.kind).toBe('none');
  });

  it('não chama o modelo sem candidatos', async () => {
    const r = await selectEvidence('dor', []);

    expect(r.kind).toBe('none');
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('degrada sem derrubar quem chama', () => {
  it('avisa quando a chave não está configurada', async () => {
    configured = false;

    const r = await selectEvidence('dor', cands);

    expect(r.kind).toBe('unavailable');
    expect(ask).not.toHaveBeenCalled();
  });

  it('avisa quando o fornecedor falha', async () => {
    ask.mockResolvedValue({ success: false, error: { code: 'TIMEOUT', message: 'sem resposta' } });

    const r = await selectEvidence('dor', cands);

    expect(r.kind).toBe('unavailable');
  });

  it('recusa acima do teto de opções por pergunta', async () => {
    const muitos = Array.from({ length: 256 }, (_, i) => ({ id: candidateId(i), text: 't' }));

    const r = await selectEvidence('dor', muitos);

    expect(r.kind).toBe('unavailable');
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('candidateId', () => {
  it('gera ids ordenáveis e estáveis', () => {
    expect(candidateId(0)).toBe('L001');
    expect(candidateId(41)).toBe('L042');
  });
});
