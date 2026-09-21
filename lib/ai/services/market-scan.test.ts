import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A leitura de mercado entra na decisão de perseguir um tema, ao lado da
 * recorrência. O que se testa aqui é a combinação — saturação sozinha não diz
 * se o campo está livre — e a recusa: preferimos não dizer nada a dizer que o
 * mercado está vazio quando a busca é que não achou fornecedor.
 */

const searchWeb = vi.fn();
const ask = vi.fn();
let exaOk = true;
let tsOk = true;

vi.mock('@/lib/research/exa-client', () => ({
  searchWeb: (...args: unknown[]) => searchWeb(...args),
  isExaConfigured: () => exaOk,
}));
vi.mock('../typesafe-client', () => ({
  ask: (...args: unknown[]) => ask(...args),
  isTypeSafeConfigured: () => tsOk,
}));

const { scanMarket, describeMarket, buildQuery } = await import('./market-scan');

const tema = { name: 'Gestão de terceiros', rationale: 'qualificação de contratadas' };

const achou = (n = 5) => {
  searchWeb.mockResolvedValue({
    success: true,
    costDollars: 0.007,
    hits: Array.from({ length: n }, (_, i) => ({
      title: `Fornecedor ${i}`,
      url: `https://exemplo${i}.com.br`,
      text: 'oferece consultoria em gestão de terceiros',
    })),
  });
};

const julgou = (saturation: number, bigPlayers: number, contentOnly: number) => {
  ask.mockResolvedValue({
    success: true,
    answers: {
      saturacao: { score: saturation, confidence: 0.85, probabilities: {} },
      grandes: bigPlayers,
      so_conteudo: contentOnly,
    },
  });
};

beforeEach(() => {
  searchWeb.mockReset();
  ask.mockReset();
  exaOk = true;
  tsOk = true;
});

describe('varredura de mercado', () => {
  it('busca primeiro e julga depois, guardando as fontes', async () => {
    achou(5);
    julgou(2.8, 0.96, 0.08);

    const r = await scanMarket(tema);

    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.scan.saturation).toBe(2.8);
    expect(r.scan.bigPlayers).toBe(0.96);
    // As fontes acompanham a leitura: o operador confere no link.
    expect(r.scan.sources).toHaveLength(5);
    expect(r.scan.costDollars).toBe(0.007);
    // A busca acontece antes do julgamento, não em paralelo.
    expect(searchWeb).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('manda o texto das páginas ao julgamento, não só os títulos', async () => {
    achou(3);
    julgou(2, 0.1, 0.1);

    await scanMarket(tema);

    const [state] = ask.mock.calls[0];
    expect(state.resultados_de_busca).toContain('oferece consultoria');
  });

  it('usa o rationale para afinar a busca', () => {
    // Sem ele, temas diferentes devolvem os mesmos fornecedores genéricos.
    expect(buildQuery(tema)).toContain('qualificação de contratadas');
    expect(buildQuery({ name: 'X', rationale: null })).not.toContain('undefined');
  });

  it('não julga quando a busca não achou nada', async () => {
    searchWeb.mockResolvedValue({ success: true, hits: [], costDollars: 0.007 });

    const r = await scanMarket(tema);

    expect(r.success).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('não busca sem as chaves configuradas', async () => {
    exaOk = false;
    expect((await scanMarket(tema)).success).toBe(false);
    exaOk = true;
    tsOk = false;
    expect((await scanMarket(tema)).success).toBe(false);
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it('propaga a falha da busca sem inventar cenário', async () => {
    searchWeb.mockResolvedValue({ success: false, error: { code: 'TIMEOUT', message: 'sem resposta' } });

    const r = await scanMarket(tema);

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('TIMEOUT');
  });
});

describe('leitura para a tela', () => {
  const scan = (over: Partial<Parameters<typeof describeMarket>[0]> = {}) => ({
    saturation: 2,
    confidence: 0.8,
    bigPlayers: 0.1,
    contentOnly: false,
    sources: [],
    costDollars: 0,
    ...over,
  });

  it('separa mercado formado COM e SEM as grandes consultorias', () => {
    // É a distinção que decide: o mesmo nível de saturação significa disputa
    // cara ou espaço aberto, conforme quem já está lá.
    expect(describeMarket(scan({ bigPlayers: 0.9 }))).toContain('já com grandes');
    expect(describeMarket(scan({ bigPlayers: 0.1 }))).toContain('espaço para especialista');
  });

  it('avisa quando a busca só achou conteúdo, sem concluir nada', () => {
    // Confundir "a busca não achou fornecedor" com "não existe fornecedor"
    // faria a tela recomendar um tema pelo motivo errado.
    const out = describeMarket(scan({ contentOnly: true, saturation: 0 }));
    expect(out).toContain('verificar à mão');
    expect(out).not.toContain('oferta a construir');
  });

  it('chama de oferta a construir só quando ninguém foi encontrado', () => {
    expect(describeMarket(scan({ saturation: 0 }))).toContain('oferta a construir');
  });

  it('marca mercado consolidado e disputado', () => {
    expect(describeMarket(scan({ saturation: 3, bigPlayers: 0.9 }))).toContain('disputado');
  });
});
