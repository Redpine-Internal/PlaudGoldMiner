import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A régua É a decisão de produto: ela diz quando um negócio novo fortalece um
 * tema que já existe e quando abre outro. Errar para o lado de juntar dilui a
 * recorrência — e é a recorrência que justifica perseguir.
 *
 * Os três níveis são as três saídas (0 descarta, 1 vai ao operador, 2 acumula),
 * então não há constante de threshold para calibrar: o que se exercita aqui é a
 * leitura da régua, não a IA.
 */

const ask = vi.fn();
let configured = true;

vi.mock('../typesafe-client', () => ({
  ask: (...args: unknown[]) => ask(...args),
  isTypeSafeConfigured: () => configured,
}));

const { routeToTheme, routeManyToThemes } = await import('./theme-router');

const negocio = {
  title: 'Consultoria para gestão de terceiros',
  pain: 'Terceiros sem qualificação de segurança',
  context: 'Aparece em contratos de manutenção',
};

const temas = [
  { id: 'th-terceiros', name: 'Gestão de terceiros críticos', rationale: 'qualificação e governança' },
  { id: 'th-cultura', name: 'Cultura e liderança', rationale: 'transformação cultural' },
];

/** Resposta do modelo: uma posição na régua por tema, na ordem de `temas`. */
const responde = (...scores: number[]) => {
  ask.mockResolvedValue({
    success: true,
    answers: Object.fromEntries(
      scores.map((s, i) => [`t${i}`, { score: s, confidence: 0.8, probabilities: {} }])
    ),
  });
};

beforeEach(() => {
  ask.mockReset();
  configured = true;
});

describe('acumula no tema existente', () => {
  it('entra no tema quando a régua diz "mesmo assunto"', async () => {
    responde(1.92, 0.41);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-terceiros');
    expect(d.score).toBe(1.92);
  });

  it('escolhe o tema de maior posição, não o primeiro da lista', async () => {
    responde(0.31, 1.88);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-cultura');
  });
});

describe('cria tema novo', () => {
  it('abre tema quando a régua diz "assuntos diferentes"', async () => {
    responde(0.29, 0.16);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('new-theme');
  });

  it('o primeiro negócio sempre abre tema — sem chamar o modelo', async () => {
    const d = await routeToTheme(negocio, []);

    expect(d.kind).toBe('new-theme');
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('pergunta ao operador', () => {
  it('no nível do meio: assunto vizinho, nem o mesmo nem outro', async () => {
    // O nível 1 enumera os casos — caso particular, causa/consequência, mesmo
    // problema visto de áreas diferentes. É decisão humana por desenho.
    responde(1.17, 0.4);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('ask-operator');
    if (d.kind !== 'ask-operator') return;
    expect(d.candidates[0].themeId).toBe('th-terceiros');
  });

  it('quando dois temas empatam no nível "mesmo assunto"', async () => {
    // 1,88 e 1,80: escolher por 0,08 seria arbitrário, e o erro ficaria
    // invisível na tela.
    responde(1.88, 1.8);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('ask-operator');
    if (d.kind !== 'ask-operator') return;
    expect(d.candidates).toHaveLength(2);
  });

  it('não chama de empate quando há folga entre o primeiro e o segundo', async () => {
    responde(1.95, 1.55);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
  });
});

describe('degrada sem derrubar a rota', () => {
  it('avisa quando a chave não está configurada, sem chamar nada', async () => {
    configured = false;

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('unavailable');
    expect(ask).not.toHaveBeenCalled();
  });

  it('avisa quando o fornecedor falha — quem chama cai no agrupamento em lote', async () => {
    ask.mockResolvedValue({
      success: false,
      error: { code: 'TIMEOUT', message: 'TypeSafe não respondeu em 10000ms.' },
    });

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('unavailable');
    if (d.kind !== 'unavailable') return;
    expect(d.reason).toContain('10000ms');
  });

  it('trata tema sem resposta como posição zero', async () => {
    // Se o modelo omitir um id, o tema não pode virar o escolhido por acidente.
    ask.mockResolvedValue({
      success: true,
      answers: { t0: { score: 1.9, confidence: 0.9, probabilities: {} } },
    });

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-terceiros');
  });
});

describe('vários negócios numa requisição', () => {
  /**
   * O estado é quase todo o custo e as perguntas são avaliadas em paralelo,
   * então N negócios × M temas num request sai muito mais barato que N
   * requests — e as respostas não mudam, porque nenhuma pergunta vê as outras.
   */
  it('decide cada negócio com as perguntas do seu próprio bloco de estado', async () => {
    ask.mockResolvedValue({
      success: true,
      answers: {
        o0_t0: { score: 1.95, confidence: 0.9, probabilities: {} },
        o0_t1: { score: 0.2, confidence: 0.8, probabilities: {} },
        o1_t0: { score: 0.1, confidence: 0.8, probabilities: {} },
        o1_t1: { score: 0.15, confidence: 0.8, probabilities: {} },
      },
    });

    const out = await routeManyToThemes(
      [
        { id: 'a', ...negocio },
        { id: 'b', title: 'Ergonomia', pain: 'LER no escritório', context: '' },
      ],
      temas
    );

    expect(ask).toHaveBeenCalledTimes(1);
    expect(out.get('a')?.kind).toBe('accumulate');
    expect(out.get('b')?.kind).toBe('new-theme');
  });

  it('dá a cada negócio seu próprio campo no estado', async () => {
    ask.mockResolvedValue({ success: true, answers: {} });

    await routeManyToThemes([{ id: 'a', ...negocio }], temas);

    const [state, questions] = ask.mock.calls[0];
    expect(Object.keys(state)).toEqual(['negocio_0']);
    // Uma pergunta por par (negócio, tema).
    expect(Object.keys(questions)).toHaveLength(2);
  });

  it('marca todos como indisponíveis quando a requisição falha', async () => {
    ask.mockResolvedValue({ success: false, error: { code: 'TIMEOUT', message: 'sem resposta' } });

    const out = await routeManyToThemes([{ id: 'a', ...negocio }, { id: 'b', ...negocio }], temas);

    expect(out.get('a')?.kind).toBe('unavailable');
    expect(out.get('b')?.kind).toBe('unavailable');
  });

  it('sem tema nenhum, todos abrem tema novo sem chamar o modelo', async () => {
    const out = await routeManyToThemes([{ id: 'a', ...negocio }], []);

    expect(out.get('a')?.kind).toBe('new-theme');
    expect(ask).not.toHaveBeenCalled();
  });
});
