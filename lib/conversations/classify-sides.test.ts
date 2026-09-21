import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyConversationSides, type ClassifyDeps } from './classify-sides';
import { SPEAKER_SIDES_VERSION, type StoredSpeakerSides } from './speaker-sides-store';
import * as speakerSide from '@/lib/ai/services/speaker-side';

const TRANSCRICAO = [
  'Speaker 1: Bom dia, queria entender como funciona a gestão de terceiros de vocês hoje. Como é o processo quando entra um prestador novo na planta?',
  '',
  'Speaker 2: Olha, a gente sofre com isso. O prestador chega, o pessoal da portaria pede a documentação, mas ninguém confere se o treinamento está válido. Semana passada entrou um sem NR-35 e só descobrimos depois.',
].join('\n');

const saved: StoredSpeakerSides[] = [];

const deps = (over: Partial<ClassifyDeps> = {}): ClassifyDeps => ({
  load: async () => ({ transcription: TRANSCRICAO, metadata: { type: 'reuniao' } }),
  save: async (_id, sides) => {
    saved.push(sides);
  },
  now: () => new Date('2026-09-21T12:00:00.000Z'),
  ...over,
});

beforeEach(() => {
  saved.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const mockClassify = (sides: speakerSide.SideResult[]) =>
  vi.spyOn(speakerSide, 'classifySpeakerSides').mockResolvedValue({ success: true, sides });

describe('classifyConversationSides', () => {
  it('classifica e grava o bloco', async () => {
    mockClassify([
      { label: 'Speaker 1', side: 'consultoria', score: 2, confidence: 0.9 },
      { label: 'Speaker 2', side: 'cliente', score: 0, confidence: 0.85 },
    ]);

    const r = await classifyConversationSides('m1', deps());

    expect(r.status).toBe('classified');
    expect(saved).toHaveLength(1);
    expect(saved[0].v).toBe(SPEAKER_SIDES_VERSION);
    expect(saved[0].sides.map((s) => s.side)).toEqual(['consultoria', 'cliente']);
    expect(saved[0].classifiedAt).toBe('2026-09-21T12:00:00.000Z');
  });

  it('calcula a fração indeterminada ponderada por volume de fala', async () => {
    mockClassify([
      { label: 'Speaker 1', side: 'consultoria', score: 2, confidence: 0.9 },
      { label: 'Speaker 2', side: 'indeterminado', score: 1, confidence: 0.2 },
    ]);

    const r = await classifyConversationSides('m1', deps());

    expect(r.status).toBe('classified');
    if (r.status !== 'classified') return;
    // Speaker 2 fala mais que Speaker 1 nesta transcrição.
    expect(r.indeterminateShare).toBeGreaterThan(0.5);
    expect(r.indeterminateShare).toBeLessThan(1);
  });

  it('não reclassifica conversa que já tem a régua atual', async () => {
    const spy = mockClassify([]);
    const metadata = {
      speaker_sides: {
        v: SPEAKER_SIDES_VERSION,
        sides: [{ label: 'Speaker 1', side: 'cliente', confidence: 0.9 }],
        indeterminateShare: 0.1,
        classifiedAt: '2026-09-20T00:00:00.000Z',
      },
    };

    const r = await classifyConversationSides(
      'm1',
      deps({ load: async () => ({ transcription: TRANSCRICAO, metadata }) })
    );

    expect(r).toEqual({ status: 'skipped', reason: 'ja-classificada' });
    expect(spy).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('reclassifica quando force, mesmo já classificada', async () => {
    const spy = mockClassify([
      { label: 'Speaker 1', side: 'cliente', score: 0, confidence: 0.9 },
      { label: 'Speaker 2', side: 'consultoria', score: 2, confidence: 0.9 },
    ]);
    const metadata = {
      speaker_sides: {
        v: SPEAKER_SIDES_VERSION,
        sides: [{ label: 'Speaker 1', side: 'cliente', confidence: 0.9 }],
        indeterminateShare: 0.1,
        classifiedAt: '2026-09-20T00:00:00.000Z',
      },
    };

    const r = await classifyConversationSides(
      'm1',
      deps({ load: async () => ({ transcription: TRANSCRICAO, metadata }) }),
      { force: true }
    );

    expect(r.status).toBe('classified');
    expect(spy).toHaveBeenCalled();
  });

  it('pula transcrição sem marcação de falante', async () => {
    const spy = mockClassify([]);

    const r = await classifyConversationSides(
      'm1',
      deps({
        load: async () => ({ transcription: 'Conversa antiga sem falante nenhum.', metadata: {} }),
      })
    );

    expect(r).toEqual({ status: 'skipped', reason: 'sem-falantes' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('pula conversa sem transcrição', async () => {
    const r = await classifyConversationSides(
      'm1',
      deps({ load: async () => ({ transcription: '   ', metadata: {} }) })
    );
    expect(r).toEqual({ status: 'skipped', reason: 'sem-transcricao' });
  });

  it('falha do TypeSafe não grava nada e não lança', async () => {
    vi.spyOn(speakerSide, 'classifySpeakerSides').mockResolvedValue({
      success: false,
      error: { code: 'TIMEOUT', message: 'tempo esgotado' },
    });

    const r = await classifyConversationSides('m1', deps());

    expect(r).toEqual({ status: 'failed', reason: 'tempo esgotado' });
    expect(saved).toHaveLength(0);
  });

  it('conversa inexistente falha sem lançar', async () => {
    const r = await classifyConversationSides('sumida', deps({ load: async () => null }));
    expect(r.status).toBe('failed');
  });
});
