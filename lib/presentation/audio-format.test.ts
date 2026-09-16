import { describe, expect, it } from 'vitest';
import { unsupportedAudioFormat } from '@/lib/presentation/audio-format';

const semSuporte = () => '';
const comSuporte = () => 'maybe';

describe('formato de áudio não suportado', () => {
  it('identifica Ogg quando o navegador não sabe reproduzir', () => {
    const url = 'https://exemplo.com/gravacao.ogg?X-Amz-Signature=abc';
    expect(unsupportedAudioFormat(url, semSuporte)).toBe('Ogg');
  });

  it('não reclama de Ogg quando o navegador reproduz', () => {
    const url = 'https://exemplo.com/gravacao.ogg';
    expect(unsupportedAudioFormat(url, comSuporte)).toBeNull();
  });

  it('deixa MP3 passar mesmo num navegador limitado', () => {
    // O caso comum: a maioria das gravações do Plaud é MP3 e toca em todo lugar.
    expect(unsupportedAudioFormat('https://exemplo.com/audio.mp3', semSuporte)).toBeNull();
  });

  it('reconhece opus e flac além de ogg', () => {
    expect(unsupportedAudioFormat('https://e.com/a.opus', semSuporte)).toBe('Opus');
    expect(unsupportedAudioFormat('https://e.com/a.oga', semSuporte)).toBe('Ogg');
    expect(unsupportedAudioFormat('https://e.com/a.flac', semSuporte)).toBe('FLAC');
  });

  it('ignora a query string ao ler a extensão', () => {
    const url = 'https://s3.amazonaws.com/path/file.ogg?response-content-type=audio%2Fmpeg';
    expect(unsupportedAudioFormat(url, semSuporte)).toBe('Ogg');
  });

  it('não afirma incompatibilidade sem como sondar o navegador', () => {
    expect(unsupportedAudioFormat('https://e.com/a.ogg', undefined)).toBeNull();
  });

  it('lida com url malformada sem quebrar', () => {
    expect(unsupportedAudioFormat('nao-e-url.ogg', semSuporte)).toBe('Ogg');
  });
});
