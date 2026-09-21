import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A regra de corte É a decisão de produto: ela diz quando um assunto novo
 * fortalece um tema que já existe e quando abre outro. Errar para o lado de
 * juntar dilui a recorrência — e é a recorrência que justifica perseguir.
 *
 * O modelo é substituído por probabilidades fixas; o que se exercita aqui é o
 * limiar, não a IA.
 */

const askNouls = vi.fn();
let configured = true;

vi.mock('../typesafe-client', () => ({
  askNouls: (...args: unknown[]) => askNouls(...args),
  isTypeSafeConfigured: () => configured,
}));

const { routeToTheme, ACCUMULATE_THRESHOLD, NEW_THEME_THRESHOLD } = await import('./theme-router');

const negocio = {
  title: 'Consultoria para gestão de terceiros',
  pain: 'Terceiros sem qualificação de segurança',
  context: 'Aparece em contratos de manutenção',
};

const temas = [
  { id: 'th-terceiros', name: 'Gestão de terceiros críticos', rationale: 'qualificação e governança' },
  { id: 'th-cultura', name: 'Cultura e liderança', rationale: 'transformação cultural' },
];

/** Resposta do modelo, uma probabilidade por tema na ordem de `temas`. */
const responde = (...probs: number[]) => {
  askNouls.mockResolvedValue({
    success: true,
    answers: Object.fromEntries(probs.map((p, i) => [`t${i}`, p])),
  });
};

beforeEach(() => {
  askNouls.mockReset();
  configured = true;
});

describe('acumula no tema existente', () => {
  it('entra no tema quando a probabilidade é alta', async () => {
    responde(0.94, 0.08);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-terceiros');
    expect(d.probability).toBe(0.94);
  });

  it('escolhe o tema de maior probabilidade, não o primeiro da lista', async () => {
    responde(0.31, 0.88);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-cultura');
  });
});

describe('cria tema novo', () => {
  it('abre tema quando nenhum chega perto', async () => {
    responde(0.12, 0.09);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('new-theme');
  });

  it('o primeiro negócio sempre abre tema — sem chamar o modelo', async () => {
    const d = await routeToTheme(negocio, []);

    expect(d.kind).toBe('new-theme');
    expect(askNouls).not.toHaveBeenCalled();
  });
});

describe('pergunta ao operador', () => {
  it('na zona cinzenta entre os dois limiares', async () => {
    responde(0.55, 0.2);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('ask-operator');
    if (d.kind !== 'ask-operator') return;
    expect(d.candidates[0].themeId).toBe('th-terceiros');
  });

  it('quando dois temas empatam acima do limiar', async () => {
    // 0,88 e 0,85: escolher por 0,03 de diferença seria arbitrário, e o erro
    // ficaria invisível na tela.
    responde(0.88, 0.85);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('ask-operator');
    if (d.kind !== 'ask-operator') return;
    expect(d.candidates).toHaveLength(2);
  });

  it('não chama de empate quando há folga entre o primeiro e o segundo', async () => {
    responde(0.95, 0.78);

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
  });
});

describe('degrada sem derrubar a rota', () => {
  it('avisa quando a chave não está configurada, sem chamar nada', async () => {
    configured = false;

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('unavailable');
    expect(askNouls).not.toHaveBeenCalled();
  });

  it('avisa quando o fornecedor falha — quem chama cai no agrupamento em lote', async () => {
    askNouls.mockResolvedValue({
      success: false,
      error: { code: 'TIMEOUT', message: 'TypeSafe não respondeu em 10000ms.' },
    });

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('unavailable');
    if (d.kind !== 'unavailable') return;
    expect(d.reason).toContain('10000ms');
  });

  it('trata tema sem resposta como probabilidade zero', async () => {
    // Se o modelo omitir um id, o tema não pode virar o escolhido por acidente.
    askNouls.mockResolvedValue({ success: true, answers: { t0: 0.9 } });

    const d = await routeToTheme(negocio, temas);

    expect(d.kind).toBe('accumulate');
    if (d.kind !== 'accumulate') return;
    expect(d.themeId).toBe('th-terceiros');
  });
});

describe('limiares', () => {
  it('acumular exige mais confiança do que descartar', () => {
    // Juntar dores diferentes dilui a recorrência que justifica o tema; o erro
    // caro é esse, então o limiar de acumular tem de ser o mais alto.
    expect(ACCUMULATE_THRESHOLD).toBeGreaterThan(NEW_THEME_THRESHOLD);
    expect(ACCUMULATE_THRESHOLD).toBeGreaterThanOrEqual(0.7);
  });

  it('manda ao operador exatamente no limiar de acumular', async () => {
    responde(ACCUMULATE_THRESHOLD, 0.1);

    const d = await routeToTheme(negocio, temas);

    // >= é acumular: o limiar é inclusivo.
    expect(d.kind).toBe('accumulate');
  });
});
