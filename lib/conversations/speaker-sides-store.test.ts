import { describe, it, expect } from 'vitest';
import {
  readSpeakerSides,
  needsClassification,
  sideOf,
  supportsIntentJudgement,
  SPEAKER_SIDES_VERSION,
  MAX_INDETERMINATE_SHARE,
} from './speaker-sides-store';

const bloco = (over: Record<string, unknown> = {}) => ({
  speaker_sides: {
    v: SPEAKER_SIDES_VERSION,
    sides: [
      { label: 'Speaker 1', side: 'consultoria', confidence: 0.9 },
      { label: 'Speaker 2', side: 'cliente', confidence: 0.8 },
    ],
    indeterminateShare: 0.1,
    classifiedAt: '2026-09-21T10:00:00.000Z',
    ...over,
  },
});

describe('readSpeakerSides', () => {
  it('lê o bloco gravado', () => {
    const r = readSpeakerSides(bloco());
    expect(r?.sides).toHaveLength(2);
    expect(r?.indeterminateShare).toBe(0.1);
  });

  it('devolve null para conversa sem classificação', () => {
    expect(readSpeakerSides({ type: 'reuniao' })).toBeNull();
    expect(readSpeakerSides(null)).toBeNull();
    expect(readSpeakerSides(undefined)).toBeNull();
    expect(readSpeakerSides('nada disso')).toBeNull();
  });

  it('descarta falante com lado que não existe na régua', () => {
    const r = readSpeakerSides(
      bloco({
        sides: [
          { label: 'Speaker 1', side: 'cliente', confidence: 0.8 },
          { label: 'Speaker 2', side: 'fornecedor', confidence: 0.9 },
        ],
      })
    );
    expect(r?.sides).toHaveLength(1);
    expect(r?.sides[0].label).toBe('Speaker 1');
  });

  it('devolve null quando nenhum falante sobrevive à validação', () => {
    expect(readSpeakerSides(bloco({ sides: [{ label: 'Speaker 1', side: 'xpto' }] }))).toBeNull();
    expect(readSpeakerSides(bloco({ sides: [] }))).toBeNull();
    expect(readSpeakerSides(bloco({ sides: 'não é lista' }))).toBeNull();
  });

  it('assume o pior quando a medida está ausente ou corrompida', () => {
    // Sem a fração, não se sabe se a conversa é julgável — 1 impede o uso.
    expect(readSpeakerSides(bloco({ indeterminateShare: undefined }))?.indeterminateShare).toBe(1);
    expect(readSpeakerSides(bloco({ indeterminateShare: 'alta' }))?.indeterminateShare).toBe(1);
  });
});

describe('needsClassification', () => {
  it('conversa nova precisa', () => {
    expect(needsClassification({ type: 'reuniao' })).toBe(true);
    expect(needsClassification(null)).toBe(true);
  });

  it('conversa já classificada com a régua atual não precisa', () => {
    expect(needsClassification(bloco())).toBe(false);
  });

  it('conversa classificada com régua antiga precisa de novo', () => {
    expect(needsClassification(bloco({ v: SPEAKER_SIDES_VERSION - 1 }))).toBe(true);
  });
});

describe('sideOf', () => {
  it('encontra o lado pelo rótulo', () => {
    const r = readSpeakerSides(bloco());
    expect(sideOf(r, 'Speaker 2')).toBe('cliente');
  });

  it('falante desconhecido é indeterminado, não erro', () => {
    expect(sideOf(readSpeakerSides(bloco()), 'Speaker 9')).toBe('indeterminado');
    expect(sideOf(null, 'Speaker 1')).toBe('indeterminado');
  });
});

describe('supportsIntentJudgement', () => {
  it('aceita conversa com pouca fala indeterminada', () => {
    expect(supportsIntentJudgement(readSpeakerSides(bloco()))).toBe(true);
  });

  it('recusa conversa acima do limite', () => {
    const r = readSpeakerSides(bloco({ indeterminateShare: MAX_INDETERMINATE_SHARE + 0.01 }));
    expect(supportsIntentJudgement(r)).toBe(false);
  });

  it('aceita exatamente no limite', () => {
    const r = readSpeakerSides(bloco({ indeterminateShare: MAX_INDETERMINATE_SHARE }));
    expect(supportsIntentJudgement(r)).toBe(true);
  });

  it('conversa não classificada não sustenta julgamento', () => {
    // Ausência de dado é "não sei", nunca "pode usar".
    expect(supportsIntentJudgement(null)).toBe(false);
  });
});
