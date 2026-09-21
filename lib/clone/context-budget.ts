/**
 * Orçamento do contexto do Clone.
 *
 * O Clone é grounded: ele só pode responder sobre conversas, oportunidades e
 * conteúdos que cabem no bloco de contexto enviado à Azure. O que não cabe não
 * existe para ele — e a falha é silenciosa, porque ele responde "não encontrei"
 * com a mesma confiança com que responderia certo.
 *
 * Duas regras, ambas nascidas de um bug real em produção (169 oportunidades no
 * banco, Clone cego para todas):
 *
 *   1. As conversas recebem uma FATIA do orçamento, não o total. Dimensionar o
 *      bloco contra o orçamento inteiro empurrava as seções seguintes para fora
 *      do corte. Com 40 conversas a fórmula antiga ainda perdia para o próprio
 *      piso de 600 chars (525 < 600) e estourava sozinha: 40 × 600 = 24k chars
 *      contra um teto de 21k.
 *
 *   2. O corte final tira do bloco de CONVERSAS, não do fim do texto. Cortar do
 *      fim apagava seções inteiras — e conversas vêm primeiro, então quem sumia
 *      era exatamente oportunidades e conteúdos.
 */

/** Chars por token em pt-BR — mesma estimativa conservadora de `lib/ai/client`. */
const CHARS_PER_TOKEN = 3.5;

/** Fatia do orçamento reservada ao bloco de conversas. O resto sustenta as demais seções. */
export const CONV_BUDGET_SHARE = 0.6;

/** Piso por conversa: abaixo disso o resumo não diz nada de útil. */
export const MIN_CONV_CHARS = 240;

/** Sobra mínima no bloco de conversas para valer a pena cortá-lo em vez do texto todo. */
const MIN_USEFUL_CONV_BLOCK = 500;

/**
 * Chars de resumo por conversa, dada a fatia do orçamento.
 *
 * Poucas conversas recebem resumos longos; muitas recebem curtos. O piso só
 * entra em jogo quando há tantas conversas que a divisão fica minúscula — e aí
 * é `trimToBudget` que protege a cota.
 */
export function perConversationChars(budgetTokens: number, conversationCount: number): number {
  const share = budgetTokens * CHARS_PER_TOKEN * CONV_BUDGET_SHARE;
  return Math.max(MIN_CONV_CHARS, Math.floor(share / Math.max(1, conversationCount)));
}

/**
 * Aplica o teto ao contexto montado.
 *
 * Recebe as seções já prontas e devolve o texto final. Quando estoura, tira do
 * bloco de conversas — identificado pelo cabeçalho, não pela posição, para que
 * uma seção nova inserida acima não faça cortar o bloco errado.
 */
export function trimToBudget(parts: string[], budgetTokens: number): string {
  const context = parts.join('\n\n');
  const maxChars = Math.floor(budgetTokens * CHARS_PER_TOKEN);
  if (context.length <= maxChars) return context;

  const overflow = context.length - maxChars;
  const convIndex = parts.findIndex((p) => p.startsWith('CONVERSAS ('));
  const convBlock = convIndex >= 0 ? parts[convIndex] : null;

  if (convBlock && convBlock.length - overflow > MIN_USEFUL_CONV_BLOCK) {
    const trimmed = [...parts];
    trimmed[convIndex] =
      convBlock.slice(0, convBlock.length - overflow) +
      '\n[…conversas truncadas para caber na cota…]';
    return trimmed.join('\n\n');
  }

  // Bloco de conversas pequeno demais para absorver o estouro: corte cego.
  return context.slice(0, maxChars) + '\n\n[…contexto truncado para caber na cota…]';
}
