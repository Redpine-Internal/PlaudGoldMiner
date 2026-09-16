/**
 * Detecta gravação em formato que o navegador não reproduz.
 *
 * O Plaud entrega as gravações em formatos diferentes — a maioria em MP3, mas
 * algumas em Ogg. O Safari não reproduz Ogg, e como todo navegador no iOS usa
 * o motor do Safari, isso inclui o PWA instalado. O `<audio>` falha antes de
 * tocar, e a mensagem genérica de erro dizia "o link pode ter expirado" —
 * mandando a pessoa tentar de novo indefinidamente por um motivo que não era
 * o dela.
 *
 * Devolve o nome do formato quando ele não é suportado, ou `null` quando é
 * suportado, quando não dá para saber, ou quando o formato não é reconhecido
 * como problemático — na dúvida, deixa o player tentar.
 */
const UNSUPPORTED_EXTENSIONS: ReadonlyArray<[RegExp, string, string]> = [
  [/\.(ogg|oga)$/, 'Ogg', 'audio/ogg'],
  [/\.opus$/, 'Opus', 'audio/ogg; codecs=opus'],
  [/\.flac$/, 'FLAC', 'audio/flac'],
];

export function unsupportedAudioFormat(
  url: string,
  canPlayType?: (type: string) => string,
): string | null {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  const match = UNSUPPORTED_EXTENSIONS.find(([pattern]) => pattern.test(path));
  if (!match) return null;

  const [, label, mime] = match;
  const probe =
    canPlayType ??
    (typeof document !== 'undefined'
      ? (type: string) => document.createElement('audio').canPlayType(type)
      : null);

  // Sem como sondar (SSR), não afirma incompatibilidade.
  if (!probe) return null;

  // '' e 'no' significam "não sei reproduzir"; 'maybe' e 'probably' são suporte.
  const verdict = probe(mime);
  return verdict === '' || verdict === 'no' ? label : null;
}
