import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O encaixe incremental decide o que grava sem pedir nada ao operador. O que
 * importa aqui é a fronteira: só entra no tema o que o roteador afirmou com
 * confiança, e uma falha no meio não pode virar meia decisão gravada.
 */

const routeToTheme = vi.fn();
vi.mock('./theme-router', () => ({
  routeToTheme: (...args: unknown[]) => routeToTheme(...args),
}));

const { assignOrphansToThemes, MAX_ORPHANS_PER_RUN } = await import('./incremental-theme-assign');

const orfao = (id: string) => ({
  id,
  title: `Negócio ${id}`,
  pain: 'dor',
  context: 'contexto',
});

const temas = [{ id: 'th-1', name: 'Gestão de terceiros', rationale: null }];

beforeEach(() => {
  routeToTheme.mockReset();
});

describe('encaixe incremental', () => {
  it('separa por decisão do roteador', async () => {
    routeToTheme
      .mockResolvedValueOnce({ kind: 'accumulate', themeId: 'th-1', themeName: 'Gestão', probability: 0.93 })
      .mockResolvedValueOnce({ kind: 'new-theme', probability: 0.1 })
      .mockResolvedValueOnce({
        kind: 'ask-operator',
        candidates: [{ themeId: 'th-1', themeName: 'Gestão', probability: 0.6 }],
      });

    const r = await assignOrphansToThemes([orfao('a'), orfao('b'), orfao('c')], temas);

    expect(r.assigned).toHaveLength(1);
    expect(r.assigned[0]).toMatchObject({ opportunityId: 'a', themeId: 'th-1', probability: 0.93 });
    expect(r.needsNewTheme).toEqual(['b']);
    expect(r.needsOperator[0].opportunityId).toBe('c');
    expect(r.unavailable).toBe(false);
  });

  it('para no primeiro indisponível e devolve o que já decidiu', async () => {
    // Metade decidida vale: o que sobrou continua órfão e o agrupamento
    // completo resolve. Insistir gastaria chamadas que vão falhar igual.
    routeToTheme
      .mockResolvedValueOnce({ kind: 'accumulate', themeId: 'th-1', themeName: 'G', probability: 0.9 })
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'timeout' })
      .mockResolvedValueOnce({ kind: 'accumulate', themeId: 'th-1', themeName: 'G', probability: 0.9 });

    const r = await assignOrphansToThemes([orfao('a'), orfao('b'), orfao('c')], temas);

    expect(r.assigned).toHaveLength(1);
    expect(r.unavailable).toBe(true);
    expect(r.unavailableReason).toBe('timeout');
    // O terceiro nem chega a ser perguntado.
    expect(routeToTheme).toHaveBeenCalledTimes(2);
  });

  it('não chama o roteador sem tema ou sem órfão', async () => {
    expect((await assignOrphansToThemes([], temas)).assigned).toHaveLength(0);
    expect((await assignOrphansToThemes([orfao('a')], [])).assigned).toHaveLength(0);
    expect(routeToTheme).not.toHaveBeenCalled();
  });

  it('respeita o teto por execução', async () => {
    routeToTheme.mockResolvedValue({ kind: 'new-theme', probability: 0.1 });
    const muitos = Array.from({ length: MAX_ORPHANS_PER_RUN + 10 }, (_, i) => orfao(`o${i}`));

    await assignOrphansToThemes(muitos, temas);

    // Cada órfão é uma requisição de ~450ms: sem teto a rota fica lenta demais.
    expect(routeToTheme).toHaveBeenCalledTimes(MAX_ORPHANS_PER_RUN);
  });

  it('passa a dor e o contexto ao roteador, não só o título', async () => {
    routeToTheme.mockResolvedValue({ kind: 'new-theme', probability: 0.1 });

    await assignOrphansToThemes([orfao('a')], temas);

    expect(routeToTheme).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Negócio a', pain: 'dor', context: 'contexto' }),
      temas,
      expect.anything()
    );
  });
});
