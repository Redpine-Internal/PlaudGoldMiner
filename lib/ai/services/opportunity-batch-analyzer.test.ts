import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes do analisador em lote — a regra de negócio que impede a repetição do
 * erro que zerou o banco: oportunidades geradas a partir de UMA conversa só.
 *
 * O analisador chama a Azure via `generateObject`. Aqui o modelo é substituído
 * por respostas fixas, então cada teste exercita a lógica de agrupamento,
 * mesclagem e filtragem — não a IA.
 */

// generateObject é o único ponto de contato com a rede. Cada teste empilha o que
// o "modelo" devolve por grupo, na ordem em que os grupos são analisados.
// A última resposta é reutilizada nos grupos seguintes: os testes de mesclagem
// se importam com o resultado de dois grupos devolverem a mesma dor, não com o
// número exato de grupos que o empacotamento produziu.
const responses: unknown[] = [];
vi.mock('ai', () => ({
  generateObject: vi.fn(async () => {
    if (!responses.length) throw new Error('resposta de modelo não configurada para este grupo');
    const object = responses.length > 1 ? responses.shift() : responses[0];
    return { object, finishReason: 'stop' };
  }),
}));

// O cliente real exige AZURE_OPENAI_API_KEY. O orçamento de tokens é mantido
// pequeno de propósito para que os testes de agrupamento consigam estourá-lo.
vi.mock('@/lib/ai/client', () => ({
  anthropic: () => 'modelo-fake',
  DEFAULT_MODEL: 'fake',
  RETRY_CONFIG: { maxRetries: 0, maxRateLimitWaits: 0 },
  getRetryDelay: () => 0,
  getRateLimitDelay: () => 0,
  isRateLimitError: () => false,
  sleep: async () => {},
  isAiConfigured: () => true,
  estimateTokens: (t: string) => Math.ceil(t.length / 4),
  MAX_CHUNK_TOKENS: 500,
  chunkTranscription: (t: string) => [t.slice(0, 2000)],
}));

const { analyzeOpportunityBatch } = await import('./opportunity-batch-analyzer');

/** Conversa mínima válida para o analisador. */
const conv = (id: string, over: Partial<{ transcription: string; summary: string; topics: string }> = {}) => ({
  id,
  title: `Reunião ${id}`,
  date: '2026-08-01',
  transcription: over.transcription ?? `Fala curta da conversa ${id}.`,
  summary: over.summary ?? null,
  topics: over.topics ?? null,
});

/** Oportunidade como a IA devolve, com refs locais ao grupo. */
const opp = (title: string, refs: string[], over: Partial<{ score: number; pain: string }> = {}) => ({
  title,
  pain: over.pain ?? 'dor',
  context: 'contexto',
  type: 'consultoria' as const,
  subtype: '',
  score: over.score ?? 70,
  sources: refs.map((ref) => ({ conversationRef: ref, excerpt: `trecho de ${ref}` })),
});

beforeEach(() => {
  responses.length = 0;
});

describe('regra de recorrência', () => {
  it('descarta oportunidade sustentada por uma única conversa quando o conjunto tem várias', async () => {
    responses.push({
      opportunities: [opp('Recorrente', ['C1', 'C2']), opp('Isolada', ['C1'])],
    });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((o) => o.title)).toEqual(['Recorrente']);
  });

  it('mantém a oportunidade de fonte única quando o conjunto é de uma conversa só', async () => {
    // Modo "single": não há como haver recorrência, e a análise individual é
    // exatamente o que o usuário pediu ao escolher uma conversa.
    responses.push({ opportunities: [opp('Isolada', ['C1'])] });

    const res = await analyzeOpportunityBatch([conv('a')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].sources).toHaveLength(1);
  });

  it('ordena por número de fontes antes do score', async () => {
    responses.push({
      opportunities: [
        opp('Score alto, 2 fontes', ['C1', 'C2'], { score: 99 }),
        opp('Score baixo, 3 fontes', ['C1', 'C2', 'C3'], { score: 10 }),
      ],
    });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b'), conv('c')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((o) => o.title)).toEqual(['Score baixo, 3 fontes', 'Score alto, 2 fontes']);
  });
});

describe('resolução de refs', () => {
  it('aceita refs entre colchetes, que o modelo às vezes produz', async () => {
    responses.push({ opportunities: [opp('Com colchetes', ['[C1]', '[c2]'])] });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].sources.map((s) => s.conversationId).sort()).toEqual(['a', 'b']);
  });

  it('descarta a oportunidade cujas refs não existem no grupo', async () => {
    // Alucinação de ref: sem fonte real a oportunidade não é rastreável até a
    // conversa, então não pode virar registro.
    responses.push({ opportunities: [opp('Inventada', ['C7', 'C9'])] });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual([]);
  });

  it('ignora só a ref inválida quando a oportunidade também tem refs válidas', async () => {
    responses.push({ opportunities: [opp('Parcial', ['C1', 'C99', 'C2'])] });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].sources.map((s) => s.conversationId)).toEqual(['a', 'b']);
  });
});

describe('mesclagem entre grupos', () => {
  // Transcrições grandes o bastante para estourar MAX_CHUNK_TOKENS (500 no mock)
  // e forçar o modo resumo. Os resumos também precisam ser grandes: o extrato de
  // duas conversas tem que passar de 500 tokens para o conjunto ser dividido em
  // mais de um grupo, que é o cenário deste bloco.
  const grande = (id: string, resumo: string) =>
    conv(id, { transcription: 'palavra '.repeat(400), summary: resumo.repeat(20) });

  it('soma as fontes da mesma dor vista em grupos diferentes', async () => {
    responses.push({ opportunities: [opp('Dor comum', ['C1', 'C2'], { score: 60 })] });
    responses.push({ opportunities: [opp('Dor comum', ['C1', 'C2'], { score: 90 })] });

    const res = await analyzeOpportunityBatch([
      grande('a', 'resumo a'.repeat(60)),
      grande('b', 'resumo b'.repeat(60)),
      grande('c', 'resumo c'.repeat(60)),
      grande('d', 'resumo d'.repeat(60)),
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.groups).toBeGreaterThan(1);
    expect(res.data).toHaveLength(1);
    // Uma oportunidade só, com as fontes dos dois grupos somadas.
    expect(res.data[0].sources.length).toBeGreaterThan(2);
    // O score mais alto entre os grupos prevalece.
    expect(res.data[0].score).toBe(90);
  });

  it('não duplica a conversa que aparece como fonte em dois grupos', async () => {
    responses.push({ opportunities: [opp('Dor comum', ['C1', 'C2'])] });
    responses.push({ opportunities: [opp('Dor comum', ['C1', 'C2'])] });

    const res = await analyzeOpportunityBatch([
      grande('a', 'resumo a'.repeat(60)),
      grande('b', 'resumo b'.repeat(60)),
      grande('c', 'resumo c'.repeat(60)),
      grande('d', 'resumo d'.repeat(60)),
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const ids = res.data[0].sources.map((s) => s.conversationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('trata títulos com caixa e espaços diferentes como a mesma oportunidade', async () => {
    responses.push({ opportunities: [opp('Gestão de EPIs', ['C1', 'C2'])] });
    responses.push({ opportunities: [opp('  GESTÃO DE EPIS  ', ['C1', 'C2'])] });

    const res = await analyzeOpportunityBatch([
      grande('a', 'resumo a'.repeat(60)),
      grande('b', 'resumo b'.repeat(60)),
      grande('c', 'resumo c'.repeat(60)),
      grande('d', 'resumo d'.repeat(60)),
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toHaveLength(1);
  });
});

describe('validação de entrada', () => {
  it('recusa conjunto vazio sem chamar a IA', async () => {
    const res = await analyzeOpportunityBatch([]);

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('reancoragem do trecho na transcrição', () => {
  it('troca a frase do resumo pela passagem correspondente da transcrição', async () => {
    // No modo resumo o excerpt vem do texto da IA, não da fala. O modal precisa
    // mostrar a fala, então o analisador procura a passagem equivalente.
    const fala =
      'O supervisor relatou que os operadores ignoram bloqueio energia durante manutenção preventiva. ' +
      'Isso aconteceu tres vezes no ultimo trimestre. ' +
      'A equipe pediu treinamento formal sobre procedimento LOTO urgente.';
    const enchimento = 'Conversa sobre assuntos administrativos diversos sem relacao. '.repeat(20);

    responses.push({
      opportunities: [
        {
          ...opp('Bloqueio', ['C1', 'C2']),
          sources: [
            {
              conversationRef: 'C1',
              excerpt: 'operadores ignoram bloqueio energia durante manutencao preventiva',
            },
            { conversationRef: 'C2', excerpt: 'algo totalmente sem relacao com o conteudo' },
          ],
        },
      ],
    });

    const res = await analyzeOpportunityBatch([
      conv('a', { transcription: enchimento + fala, summary: 'resumo a'.repeat(60) }),
      conv('b', { transcription: 'palavra '.repeat(400), summary: 'resumo b'.repeat(60) }),
      conv('c', { transcription: 'palavra '.repeat(400), summary: 'resumo c'.repeat(60) }),
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    const daConversaA = res.data[0].sources.find((s) => s.conversationId === 'a');
    // Achou a passagem real: o trecho agora contém a fala, não a paráfrase.
    expect(daConversaA?.excerpt).toContain('bloqueio energia');
    expect(daConversaA?.excerpt).toContain('supervisor relatou');
    // E fica marcado como fala, que é o que autoriza as aspas no modal.
    expect(daConversaA?.fromTranscription).toBe(true);
  });

  it('mantém o texto do resumo quando não há passagem correspondente', async () => {
    responses.push({
      opportunities: [
        {
          ...opp('Sem ancora', ['C1', 'C2']),
          sources: [
            { conversationRef: 'C1', excerpt: 'assunto inexistente completamente estranho' },
            { conversationRef: 'C2', excerpt: 'outro assunto igualmente inexistente aqui' },
          ],
        },
      ],
    });

    const res = await analyzeOpportunityBatch([
      conv('a', { transcription: 'palavra '.repeat(400), summary: 'resumo a'.repeat(60) }),
      conv('b', { transcription: 'palavra '.repeat(400), summary: 'resumo b'.repeat(60) }),
      conv('c', { transcription: 'palavra '.repeat(400), summary: 'resumo c'.repeat(60) }),
    ]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    // Preferível o texto do resumo a um trecho inventado.
    expect(res.data[0].sources[0].excerpt).toBe('assunto inexistente completamente estranho');
    // Mas marcado como não-fala: o modal não pode exibir isso entre aspas.
    expect(res.data[0].sources[0].fromTranscription).toBe(false);
  });

  it('marca como fala o trecho vindo da análise sobre a transcrição', async () => {
    // Conjunto pequeno: o analisador lê a transcrição direto, sem passar por
    // resumo, então o que o modelo cita já é fala e não precisa de reancoragem.
    responses.push({ opportunities: [opp('Direto da fala', ['C1', 'C2'])] });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].sources.every((s) => s.fromTranscription)).toBe(true);
  });

  it('não marca como fala a fonte que veio sem trecho nenhum', async () => {
    responses.push({
      opportunities: [
        {
          ...opp('Sem trecho', ['C1', 'C2']),
          sources: [
            { conversationRef: 'C1', excerpt: '' },
            { conversationRef: 'C2', excerpt: '  ' },
          ],
        },
      ],
    });

    const res = await analyzeOpportunityBatch([conv('a'), conv('b')]);

    expect(res.success).toBe(true);
    if (!res.success) return;
    // Sem texto não há o que citar — marcar como fala abriria aspas vazias.
    expect(res.data[0].sources.every((s) => s.excerpt === null)).toBe(true);
    expect(res.data[0].sources.every((s) => s.fromTranscription === false)).toBe(true);
  });
});
