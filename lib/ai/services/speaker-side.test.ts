import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O lado do falante é o que separa dor de pitch: "a gente tem dificuldade com
 * terceiros" é relato do cliente quando vem do comprador e é discurso de venda
 * quando vem de quem vende. Mesmas palavras, sinais opostos.
 *
 * A fronteira testada é sempre a mesma: na dúvida, `indeterminado` — porque
 * atribuir lado sem base inverte o sinal das perguntas que dependem dele.
 */

const ask = vi.fn();
let configured = true;

vi.mock('../typesafe-client', () => ({
  ask: (...args: unknown[]) => ask(...args),
  isTypeSafeConfigured: () => configured,
}));

const { parseSpeakers, classifySpeakerSides, indeterminateShare } = await import('./speaker-side');

/** Fala longa o bastante para ser julgada (o mínimo é 120 chars). */
const fala = (t: string) => t.padEnd(140, ' .');

const responde = (...scores: Array<[number, number]>) => {
  ask.mockResolvedValue({
    success: true,
    answers: Object.fromEntries(
      scores.map(([score, confidence], i) => [
        `falante_${i}`,
        { score, confidence, probabilities: {} },
      ])
    ),
  });
};

beforeEach(() => {
  ask.mockReset();
  configured = true;
});

describe('parseSpeakers', () => {
  it('agrupa as falas por falante', () => {
    const out = parseSpeakers(
      'Speaker 1: Bom dia\n\nSpeaker 2: Oi\n\nSpeaker 1: Como vai?'
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ label: 'Speaker 1', utterances: ['Bom dia', 'Como vai?'] });
  });

  it('ignora linhas sem marcação de falante', () => {
    // Transcrição antiga, sem falante, não pode virar um falante fantasma.
    expect(parseSpeakers('texto corrido sem marcação')).toHaveLength(0);
  });
});

describe('classifySpeakerSides', () => {
  const dois = [
    { label: 'Speaker 1', utterances: [fala('E como funciona a gestão de terceiros aqui?')] },
    { label: 'Speaker 2', utterances: [fala('A gente tem dificuldade de engajar o dono da contratada')] },
  ];

  it('separa quem contrata de quem presta o serviço', () => {
    responde([2, 0.9], [0, 0.88]);

    return classifySpeakerSides(dois).then((r) => {
      expect(r.success).toBe(true);
      if (!r.success) return;
      const porLabel = Object.fromEntries(r.sides.map((s) => [s.label, s.side]));
      expect(porLabel['Speaker 1']).toBe('consultoria');
      expect(porLabel['Speaker 2']).toBe('cliente');
    });
  });

  it('classifica todos os falantes numa requisição só', async () => {
    responde([2, 0.9], [0, 0.9]);

    await classifySpeakerSides(dois);

    expect(ask).toHaveBeenCalledTimes(1);
    const [state] = ask.mock.calls[0];
    // Cada falante é um campo do estado, para o modelo comparar os papéis.
    expect(Object.keys(state)).toEqual(['falante_0', 'falante_1']);
  });

  it('vira indeterminado quando a confiança é baixa', async () => {
    // Distribuição espalhada: nenhum nível se destaca, e atribuir lado seria
    // chute com tipo.
    responde([0.2, 0.15], [1.9, 0.95]);

    const r = await classifySpeakerSides(dois);

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.sides.find((s) => s.label === 'Speaker 1')?.side).toBe('indeterminado');
  });

  it('vira indeterminado no nível do meio, mesmo com confiança alta', async () => {
    // O nível 1 é uma resposta legítima: participante que só confirma, assunto
    // administrativo, ou terceiro que não compra nem vende.
    responde([1, 0.92], [0, 0.9]);

    const r = await classifySpeakerSides(dois);

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.sides.find((s) => s.label === 'Speaker 1')?.side).toBe('indeterminado');
  });

  it('não manda ao modelo quem quase não falou', async () => {
    // Julgar "tá" e "uhum" produz ruído com aparência de resposta.
    responde([0, 0.9]);

    const r = await classifySpeakerSides([
      { label: 'Speaker 1', utterances: [fala('descreve a operação da empresa')] },
      { label: 'Speaker 2', utterances: ['tá', 'uhum'] },
    ]);

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.sides.find((s) => s.label === 'Speaker 2')?.side).toBe('indeterminado');
    const [state] = ask.mock.calls[0];
    expect(Object.keys(state)).toHaveLength(1);
  });

  it('não chama o modelo quando não há falante nenhum', async () => {
    const r = await classifySpeakerSides([]);

    expect(r.success).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('avisa quando a chave não está configurada', async () => {
    configured = false;

    const r = await classifySpeakerSides(dois);

    expect(r.success).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('indeterminateShare', () => {
  it('pesa por volume de fala, não por número de falantes', () => {
    // Um participante mudo indeterminado não compromete a leitura; quem fala
    // metade da conversa, sim.
    const speakers = [
      { label: 'Speaker 1', utterances: ['x'.repeat(900)] },
      { label: 'Speaker 2', utterances: ['y'.repeat(100)] },
    ];
    const sides = [
      { label: 'Speaker 1', side: 'cliente' as const, score: 0, confidence: 0.9 },
      { label: 'Speaker 2', side: 'indeterminado' as const, score: 1, confidence: 0.2 },
    ];

    expect(indeterminateShare(speakers, sides)).toBeCloseTo(0.1, 2);
  });

  it('conta como indeterminado o falante que não foi classificado', () => {
    const speakers = [{ label: 'Speaker 9', utterances: ['z'.repeat(100)] }];

    expect(indeterminateShare(speakers, [])).toBe(1);
  });

  it('devolve 1 quando não há fala nenhuma', () => {
    expect(indeterminateShare([], [])).toBe(1);
  });
});
