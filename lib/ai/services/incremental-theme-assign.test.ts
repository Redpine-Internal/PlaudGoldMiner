import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O encaixe incremental decide o que gravar sem pedir nada ao operador. O que
 * importa aqui é a fronteira: só entra no tema o que a régua afirmou como
 * "mesmo assunto", e uma falha no meio não pode virar meia decisão gravada.
 */

const routeManyToThemes = vi.fn();
vi.mock('./theme-router', () => ({
  routeManyToThemes: (...args: unknown[]) => routeManyToThemes(...args),
}));

const { assignOrphansToThemes, MAX_ORPHANS_PER_RUN } = await import('./incremental-theme-assign');

const orfao = (id: string) => ({
  id,
  title: `Negócio ${id}`,
  pain: 'dor',
  context: 'contexto',
});

const temas = [{ id: 'th-1', name: 'Gestão de terceiros', rationale: null }];

/** Devolve as decisões indexadas por id, como a rota em lote faz. */
const decide = (map: Record<string, unknown>) => {
  routeManyToThemes.mockResolvedValue(new Map(Object.entries(map)));
};

beforeEach(() => {
  routeManyToThemes.mockReset();
});

describe('encaixe incremental', () => {
  it('separa por decisão da régua', async () => {
    decide({
      a: { kind: 'accumulate', themeId: 'th-1', themeName: 'Gestão', score: 1.93, confidence: 0.9 },
      b: { kind: 'new-theme', bestScore: 0.1 },
      c: { kind: 'ask-operator', candidates: [{ themeId: 'th-1', themeName: 'Gestão', score: 1.2 }] },
    });

    const r = await assignOrphansToThemes([orfao('a'), orfao('b'), orfao('c')], temas);

    expect(r.assigned).toHaveLength(1);
    expect(r.assigned[0]).toMatchObject({ opportunityId: 'a', themeId: 'th-1', score: 1.93 });
    expect(r.needsNewTheme).toEqual(['b']);
    expect(r.needsOperator[0].opportunityId).toBe('c');
    expect(r.unavailable).toBe(false);
  });

  it('manda vários negócios numa requisição só', async () => {
    // O estado é quase todo o custo; uma requisição por negócio desperdiçaria
    // o paralelismo que a API já oferece.
    decide(Object.fromEntries(['a', 'b', 'c'].map((id) => [id, { kind: 'new-theme', bestScore: 0 }])));

    await assignOrphansToThemes([orfao('a'), orfao('b'), orfao('c')], temas);

    expect(routeManyToThemes).toHaveBeenCalledTimes(1);
    expect(routeManyToThemes.mock.calls[0][0]).toHaveLength(3);
  });

  it('para no primeiro indisponível e devolve o que já decidiu', async () => {
    // Metade decidida vale: o que sobrou continua órfão e o agrupamento
    // completo resolve.
    decide({
      a: { kind: 'accumulate', themeId: 'th-1', themeName: 'G', score: 1.9, confidence: 0.9 },
      b: { kind: 'unavailable', reason: 'timeout' },
      c: { kind: 'accumulate', themeId: 'th-1', themeName: 'G', score: 1.9, confidence: 0.9 },
    });

    const r = await assignOrphansToThemes([orfao('a'), orfao('b'), orfao('c')], temas);

    expect(r.assigned).toHaveLength(1);
    expect(r.unavailable).toBe(true);
    expect(r.unavailableReason).toBe('timeout');
  });

  it('não chama o roteador sem tema ou sem órfão', async () => {
    expect((await assignOrphansToThemes([], temas)).assigned).toHaveLength(0);
    expect((await assignOrphansToThemes([orfao('a')], [])).assigned).toHaveLength(0);
    expect(routeManyToThemes).not.toHaveBeenCalled();
  });

  it('respeita o teto por execução', async () => {
    routeManyToThemes.mockImplementation(async (bloco: Array<{ id: string }>) =>
      new Map(bloco.map((o) => [o.id, { kind: 'new-theme', bestScore: 0 }]))
    );
    const muitos = Array.from({ length: MAX_ORPHANS_PER_RUN + 10 }, (_, i) => orfao(`o${i}`));

    const r = await assignOrphansToThemes(muitos, temas);

    const roteados = routeManyToThemes.mock.calls.reduce<number>(
      (n, call) => n + (call[0] as unknown[]).length,
      0
    );
    expect(roteados).toBe(MAX_ORPHANS_PER_RUN);
    expect(r.needsNewTheme).toHaveLength(MAX_ORPHANS_PER_RUN);
  });

  it('passa a dor e o contexto ao roteador, não só o título', async () => {
    decide({ a: { kind: 'new-theme', bestScore: 0 } });

    await assignOrphansToThemes([orfao('a')], temas);

    expect(routeManyToThemes.mock.calls[0][0][0]).toMatchObject({
      title: 'Negócio a',
      pain: 'dor',
      context: 'contexto',
    });
  });
});
