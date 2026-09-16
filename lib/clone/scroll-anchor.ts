/**
 * Ancoragem de scroll do Chat.
 *
 * O streaming reescreve a última resposta dezenas de vezes por segundo. Se o
 * autoscroll for incondicional, quem rolou para cima para reler é arrancado de
 * volta ao fim a cada fragmento — na prática, a conversa fica impossível de ler
 * enquanto a resposta chega. A regra aqui é a mesma de qualquer chat maduro:
 * só acompanha o fim quem já estava no fim.
 */

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Folga em px para considerar "no fim".
 *
 * Scroll suave, zoom do navegador e arredondamento sub-pixel quase nunca deixam
 * `scrollTop + clientHeight` bater exatamente em `scrollHeight`. No iOS o
 * momentum ainda dispara eventos depois do dedo sair da tela, e o valor pode
 * passar do fim (bounce) ou parar alguns pixels antes. 64px cobre isso sem
 * engolir uma rolagem intencional — uma linha de texto tem ~21px, então a folga
 * equivale a menos de três linhas.
 */
export const SCROLL_BOTTOM_TOLERANCE = 64;

/** Distância em px entre a posição atual e o fim do conteúdo. */
export function distanceFromBottom({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): number {
  return scrollHeight - clientHeight - scrollTop;
}

/**
 * A pessoa está no fim (ou perto o bastante para que acompanhar o fim seja o
 * que ela espera)?
 */
export function isAtBottom(metrics: ScrollMetrics, tolerance: number = SCROLL_BOTTOM_TOLERANCE): boolean {
  // O bounce do iOS produz distância negativa; ainda é "no fim".
  return distanceFromBottom(metrics) <= tolerance;
}

/**
 * Deve reancorar o scroll no fim depois desta atualização de conteúdo?
 *
 * `force` representa intenção explícita da pessoa (ela acabou de enviar uma
 * mensagem) e vence a posição atual. Fora isso, respeita onde ela está.
 */
export function shouldFollowBottom(
  metrics: ScrollMetrics,
  options: { force?: boolean; tolerance?: number } = {},
): boolean {
  if (options.force) return true;
  return isAtBottom(metrics, options.tolerance ?? SCROLL_BOTTOM_TOLERANCE);
}
