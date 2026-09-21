import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes do agrupamento por tema.
 *
 * A tela "Por tema" mostra os negócios agrupados e nada mais — não há uma lista
 * paralela de "sem tema". Então a invariante que importa aqui é a cobertura:
 * todo negócio que entra sai em exatamente um tema, aconteça o que acontecer com
 * a resposta do modelo. Se ela quebrar, um card some da tela sem deixar rastro.
 *
 * O modelo é substituído por respostas fixas; o que se exercita é a resolução de
 * refs, não a IA.
 */

const responses: unknown[] = [];
vi.mock('ai', () => ({
  generateObject: vi.fn(async () => {
    if (!responses.length) throw new Error('resposta de modelo não configurada');
    return { object: responses.shift(), finishReason: 'stop' };
  }),
}));

vi.mock('@/lib/ai/client', () => ({
  anthropic: () => 'modelo-fake',
  DEFAULT_MODEL: 'fake',
  RETRY_CONFIG: { maxRetries: 0, maxRateLimitWaits: 0 },
  getRetryDelay: () => 0,
  getRateLimitDelay: () => 0,
  isRateLimitError: () => false,
  sleep: async () => {},
  isAiConfigured: () => true,
}));

const { groupBusinessThemes } = await import('./business-theme-grouper');

/** Negócio mínimo válido para o agrupador. */
const neg = (id: string, title = `Negócio ${id}`, subtype: string | null = null) => ({
  id,
  title,
  type: 'consultoria',
  subtype,
});

/** Tema como a IA devolve, com refs. */
const tema = (name: string, refs: string[], rationale = 'o que une o grupo') => ({
  name,
  rationale,
  opportunityRefs: refs,
});

/** Refs sequenciais de um lote: refs(1, 3) => ['N1','N2','N3']. */
const refs = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `N${from + i}`);

beforeEach(() => {
  responses.length = 0;
});

describe('cobertura dos negócios', () => {
  it('agrupa os negócios nos temas que a IA devolveu', async () => {
    responses.push({ themes: [tema('Cultura e liderança', ['N1', 'N3']), tema('Terceiros', ['N2'])] });

    const res = await groupBusinessThemes([neg('a'), neg('b'), neg('c')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((t) => t.name)).toEqual(['Cultura e liderança', 'Terceiros']);
    expect(res.data[0].opportunityIds).toEqual(['a', 'c']);
    expect(res.data[1].opportunityIds).toEqual(['b']);
  });

  it('dá tema próprio ao negócio que a IA esqueceu', async () => {
    // Acontece com listas longas: o modelo para antes do fim. Sem este resgate o
    // negócio 'c' sumiria da tela.
    responses.push({ themes: [tema('Cultura', ['N1', 'N2'])] });

    const res = await groupBusinessThemes([neg('a'), neg('b'), neg('c', 'Gestão viária')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const ids = res.data.flatMap((t) => t.opportunityIds);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
    // O órfão vira um tema com o próprio título, para não virar "Outros".
    expect(res.data.find((t) => t.opportunityIds.includes('c'))?.name).toBe('Gestão viária');
  });

  it('usa o subtipo como nome do tema do órfão quando ele existe', async () => {
    responses.push({ themes: [] });

    const res = await groupBusinessThemes([neg('a', 'Título longo e prolixo', 'Consultoria em PGR')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].name).toBe('Consultoria em PGR');
  });

  it('não deixa o mesmo negócio em dois temas', async () => {
    // O modelo repete refs quando um negócio parece caber em dois lugares. Um
    // card duplicado infla a recorrência e distorce a ordenação.
    responses.push({ themes: [tema('Cultura', ['N1', 'N2']), tema('Liderança', ['N2', 'N3'])] });

    const res = await groupBusinessThemes([neg('a'), neg('b'), neg('c')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const ids = res.data.flatMap((t) => t.opportunityIds);
    expect(new Set(ids).size).toBe(ids.length);
    // O primeiro tema fica com o negócio disputado.
    expect(res.data.find((t) => t.name === 'Cultura')?.opportunityIds).toContain('b');
  });
});

describe('resolução de refs', () => {
  it('aceita refs entre colchetes e em caixa baixa', async () => {
    responses.push({ themes: [tema('Cultura', ['[N1]', 'n2'])] });

    const res = await groupBusinessThemes([neg('a'), neg('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].opportunityIds).toEqual(['a', 'b']);
  });

  it('ignora ref inventada sem perder o resto do tema', async () => {
    responses.push({ themes: [tema('Cultura', ['N1', 'N99'])] });

    const res = await groupBusinessThemes([neg('a'), neg('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const cultura = res.data.find((t) => t.name === 'Cultura');
    expect(cultura?.opportunityIds).toEqual(['a']);
    // 'b' não foi para lugar nenhum, então precisa ter sido resgatado.
    expect(res.data.flatMap((t) => t.opportunityIds).sort()).toEqual(['a', 'b']);
  });

  it('descarta tema que ficou sem nenhum negócio válido', async () => {
    responses.push({ themes: [tema('Fantasma', ['N7', 'N9']), tema('Real', ['N1'])] });

    const res = await groupBusinessThemes([neg('a')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((t) => t.name)).toEqual(['Real']);
  });

  it('descarta tema sem nome', async () => {
    responses.push({ themes: [tema('   ', ['N1'])] });

    const res = await groupBusinessThemes([neg('a', 'Gestão de EPIs')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    // O negócio não se perde: cai no resgate de órfãos.
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Gestão de EPIs');
  });
});

describe('ordenação', () => {
  it('põe o tema com mais negócios primeiro — é a recorrência que decide', async () => {
    responses.push({
      themes: [tema('Pequeno', ['N1']), tema('Grande', ['N2', 'N3', 'N4'])],
    });

    const res = await groupBusinessThemes([neg('a'), neg('b'), neg('c'), neg('d')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((t) => t.name)).toEqual(['Grande', 'Pequeno']);
  });
});

describe('validação de entrada', () => {
  it('recusa lista vazia sem chamar a IA', async () => {
    const res = await groupBusinessThemes([]);

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa acervo acima do teto de segurança', async () => {
    // Acima de MAX_ITEMS (400) o agrupamento levaria minutos de chamadas
    // sequenciais — quem chama decide filtrar, arquivar ou paginar.
    const muitos = Array.from({ length: 401 }, (_, i) => neg(`id${i}`));

    const res = await groupBusinessThemes(muitos);

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('VALIDATION_ERROR');
  });

});

describe('conjunto maior que um lote', () => {
  /**
   * O acervo cresceu além de um lote e a tela "Por tema" parou de atualizar
   * (o agrupador recusava acima de 120). Agora divide em lotes e consolida:
   * o mesmo assunto sai de lotes diferentes com nomes diferentes, e a segunda
   * passada funde os dois num tema só.
   */
  it('divide em lotes e funde temas equivalentes de lotes diferentes', async () => {
    // 100 negócios = 2 lotes (80 + 20).
    const muitos = Array.from({ length: 100 }, (_, i) => neg(`id${i}`));

    // Lote 1 (refs N1..N80) e lote 2 (refs N1..N20) — a numeração reinicia
    // por lote, que é o que a consolidação precisa resolver sem confundir.
    responses.push({ themes: [tema('Gestão de terceiros', refs(1, 80))] });
    responses.push({ themes: [tema('Governança de contratadas', refs(1, 20))] });
    // Consolidação: os 2 temas acima viram itens N1 e N2, e são o mesmo.
    responses.push({ themes: [tema('Gestão de terceiros', ['N1', 'N2'])] });

    const res = await groupBusinessThemes(muitos);

    expect(res.success).toBe(true);
    if (!res.success) return;

    // Um tema só, com todos os 100 negócios — nenhum perdido, nenhum duplicado.
    expect(res.data).toHaveLength(1);
    expect(res.data[0].name).toBe('Gestão de terceiros');
    expect(res.data[0].opportunityIds).toHaveLength(100);
    expect(new Set(res.data[0].opportunityIds).size).toBe(100);
  });

  it('mantém os temas dos lotes quando a consolidação falha', async () => {
    const muitos = Array.from({ length: 100 }, (_, i) => neg(`id${i}`));

    responses.push({ themes: [tema('Tema A', refs(1, 80))] });
    responses.push({ themes: [tema('Tema B', refs(1, 20))] });
    // Sem 3ª resposta: a consolidação falha. Agrupamento parcial > erro na tela.

    const res = await groupBusinessThemes(muitos);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toHaveLength(2);
    // A cobertura continua valendo mesmo com a consolidação quebrada.
    expect(res.data.flatMap((t) => t.opportunityIds)).toHaveLength(100);
  });

  it('segue com os lotes que deram certo quando um lote falha', async () => {
    const muitos = Array.from({ length: 100 }, (_, i) => neg(`id${i}`));

    responses.push({ themes: [tema('Tema A', refs(1, 80))] });
    // Lote 2 falha (sem resposta) e a consolidação também: sobra o lote 1.
    const res = await groupBusinessThemes(muitos);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.flatMap((t) => t.opportunityIds)).toHaveLength(80);
  });
});
