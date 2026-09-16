/**
 * Prévia legível de um resumo em Markdown.
 *
 * Os resumos chegam como documento inteiro ("## Informações da reunião",
 * "> **Fecha:** 2026-09-14…"). Impressos crus na lista, vazavam marcação e
 * repetiam a data que já aparece formatada logo abaixo da linha. Aqui o texto
 * é reduzido à primeira frase de conteúdo real: sem marcação, sem cabeçalho de
 * metadados e sem duplicar o que a linha já mostra.
 */

/** Linhas que só carregam metadados da reunião — a lista já exibe data e duração. */
const METADATA_LINE =
  /^\s*(?:[>*\-+\s]*)(?:\*\*)?(?:informa(?:ç|c)(?:ões|oes)\s+da\s+reuni(?:ã|a)o|fecha|data|hora|dura(?:ç|c)(?:ã|a)o|duraci(?:ó|o)n|ubicaci(?:ó|o)n|local(?:iza(?:ç|c)(?:ã|a)o)?|participantes?|asistentes|particip(?:a|an)tes|t(?:í|i)tulo|titulo|tipo|status)(?:\*\*)?\s*:?/i;

/** Remove a marcação inline mais comum, preservando o texto. */
function stripInlineMarkdown(text: string): string {
  return text
    // imagens antes de links, senão o "!" sobra
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/(\*\*\*|___)(.*?)\1/g, "$2")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tira prefixos de bloco (citação, lista, cabeçalho) do início da linha. */
function stripBlockPrefix(line: string): string {
  let out = line;
  let previous: string;
  do {
    previous = out;
    out = out
      .replace(/^\s*>+\s?/, "")
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, "");
  } while (out !== previous);
  return out;
}

export interface SummaryExcerptOptions {
  /** Comprimento máximo do trecho, incluindo a reticência. Padrão 160. */
  maxLength?: number;
}

/**
 * Converte um resumo em Markdown na primeira frase útil, em texto puro.
 * Devolve string vazia quando não sobra conteúdo — o chamador então omite a
 * prévia em vez de mostrar uma linha vazia.
 */
export function summaryExcerpt(summary?: string | null, options: SummaryExcerptOptions = {}): string {
  const maxLength = options.maxLength ?? 160;
  if (!summary) return "";

  const candidates = summary
    .replace(/\r\n?/g, "\n")
    // blocos de código inteiros não viram prévia
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    // linha horizontal (---, ***, ___) antes de stripBlockPrefix, que comeria
    // o primeiro traço e deixaria "--" passar como texto
    .map((line) => (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ? "" : line))
    .map(stripBlockPrefix)
    .map(stripInlineMarkdown)
    .filter((line) => line.length > 0)
    .filter((line) => !METADATA_LINE.test(line));

  const text = candidates.find((line) => line.length > 0) ?? "";
  if (!text) return "";

  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.5 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + "…";
}

/**
 * Tópicos protocolares. Toda gravação começa com cumprimento e teste de áudio;
 * usá-los como prévia diria o mesmo de todas as conversas.
 */
const SMALL_TALK_TOPIC =
  /^\s*(?:abertura|saudaç(?:ão|ao)|saludo|cumprimentos?|in(?:í|i)cio|inicio|introduç(?:ão|ao)|apresentaç(?:ões|oes|ão|ao)|encerramento|cierre|despedida|conclus(?:ão|ao)|pr(?:ó|o)ximos passos|agradecimentos?)\b|\b(?:prueba|teste)\s+(?:de\s+)?(?:audio|áudio|som)\b/i;

/**
 * Prévia a partir dos tópicos da conversa: diz sobre o que se falou, enquanto o
 * resumo costuma abrir com rótulo genérico ("Notas da Reunião"). Descarta os
 * tópicos protocolares e junta os primeiros restantes.
 *
 * `raw` é o array JSON persistido em `conversations.topics`. Devolve string
 * vazia quando não há tópico aproveitável — aí o chamador recorre ao resumo.
 */
export function topicsExcerpt(raw: string | null | undefined, limit = 3): string {
  if (!raw) return '';
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!Array.isArray(list)) return '';

  const topics = list
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripInlineMarkdown(item))
    .filter((item) => item.length > 0 && !SMALL_TALK_TOPIC.test(item));

  return topics.slice(0, limit).join(' · ');
}

/**
 * Prévia da conversa para a lista: tópicos quando existirem, senão a primeira
 * frase do resumo. Vazio significa que a linha deve omitir a prévia.
 */
export function conversationExcerpt(
  topics: string | null | undefined,
  summary: string | null | undefined,
): string {
  return topicsExcerpt(topics) || summaryExcerpt(summary);
}
