import { routeManyToThemes, type ThemeCandidate, type OpportunityToRoute } from './theme-router';

/**
 * Encaixa os negócios órfãos nos temas que já existem, um a um.
 *
 * O reagrupamento completo relê TODOS os negócios e reescreve todos os temas —
 * caro, e desnecessário quando o que mudou foram cinco negócios novos de uma
 * reunião. Aqui cada órfão é roteado contra os temas atuais, e os temas que já
 * estavam na tela não se movem.
 *
 * Só o que o modelo não souber encaixar volta para o agrupamento completo, que
 * é quem sabe criar tema novo a partir do conjunto.
 */

export interface OrphanOpportunity extends OpportunityToRoute {
  id: string;
}

export interface AssignResult {
  /** Negócio → tema existente, com a posição na régua que sustentou a decisão. */
  assigned: Array<{
    opportunityId: string;
    themeId: string;
    themeName: string;
    score: number;
    confidence: number;
  }>;
  /** Não encaixou em nada: assunto novo, precisa do agrupamento completo. */
  needsNewTheme: string[];
  /** Assunto vizinho ou empate — a decisão é do operador, não da máquina. */
  needsOperator: Array<{
    opportunityId: string;
    candidates: Array<{ themeId: string; themeName: string; score: number }>;
  }>;
  /** Roteamento indisponível (chave ausente, timeout, fornecedor fora). */
  unavailable: boolean;
  unavailableReason?: string;
}

/** Teto de negócios por execução, para a rota não ficar lenta demais. */
export const MAX_ORPHANS_PER_RUN = 40;

/**
 * Negócios por requisição.
 *
 * Cada negócio gera uma pergunta por tema, então o que importa é o produto
 * N × M. Com ~10 temas, 8 negócios dão 80 perguntas — dentro do que a API
 * responde em menos de um segundo, e longe do teto de opções por pergunta.
 * Perguntas a mais quase não mudam o tempo; requisições a mais mudam.
 */
const OPPORTUNITIES_PER_REQUEST = 8;

export async function assignOrphansToThemes(
  orphans: OrphanOpportunity[],
  themes: ThemeCandidate[],
  opts: { signal?: AbortSignal } = {}
): Promise<AssignResult> {
  const result: AssignResult = {
    assigned: [],
    needsNewTheme: [],
    needsOperator: [],
    unavailable: false,
  };

  if (!orphans.length || !themes.length) return result;

  const fila = orphans.slice(0, MAX_ORPHANS_PER_RUN);

  for (let i = 0; i < fila.length; i += OPPORTUNITIES_PER_REQUEST) {
    const bloco = fila.slice(i, i + OPPORTUNITIES_PER_REQUEST);
    const decisions = await routeManyToThemes(bloco, themes, { signal: opts.signal });

    for (const orphan of bloco) {
      const decision = decisions.get(orphan.id);
      if (!decision) continue;

      switch (decision.kind) {
        case 'accumulate':
          result.assigned.push({
            opportunityId: orphan.id,
            themeId: decision.themeId,
            themeName: decision.themeName,
            score: decision.score,
            confidence: decision.confidence,
          });
          break;

        case 'new-theme':
          result.needsNewTheme.push(orphan.id);
          break;

        case 'ask-operator':
          result.needsOperator.push({
            opportunityId: orphan.id,
            candidates: decision.candidates,
          });
          break;

        case 'unavailable':
          // O fornecedor caiu: para aqui e devolve o que já decidiu. O que
          // sobrou continua órfão, e o agrupamento completo resolve.
          result.unavailable = true;
          result.unavailableReason = decision.reason;
          return result;
      }
    }
  }

  return result;
}
