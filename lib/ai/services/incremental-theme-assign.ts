import { routeToTheme, type ThemeCandidate, type OpportunityToRoute } from './theme-router';

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
  /** Negócio → tema existente, com a probabilidade que sustentou a decisão. */
  assigned: Array<{ opportunityId: string; themeId: string; themeName: string; probability: number }>;
  /** Não encaixou em nada: assunto novo, precisa do agrupamento completo. */
  needsNewTheme: string[];
  /** Zona cinzenta ou empate — a decisão é do operador, não da máquina. */
  needsOperator: Array<{
    opportunityId: string;
    candidates: Array<{ themeId: string; themeName: string; probability: number }>;
  }>;
  /** Roteamento indisponível (chave ausente, timeout, fornecedor fora). */
  unavailable: boolean;
  unavailableReason?: string;
}

/**
 * Teto de negócios por execução.
 *
 * Cada órfão é uma requisição ao TypeSafe (~450ms), e elas são sequenciais para
 * não abrir dezenas de conexões de uma vez. Acima disso o tempo de resposta da
 * rota fica ruim e o agrupamento completo sai mais barato de qualquer forma.
 */
export const MAX_ORPHANS_PER_RUN = 40;

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

  for (const orphan of orphans.slice(0, MAX_ORPHANS_PER_RUN)) {
    const decision = await routeToTheme(orphan, themes, { signal: opts.signal });

    switch (decision.kind) {
      case 'accumulate':
        result.assigned.push({
          opportunityId: orphan.id,
          themeId: decision.themeId,
          themeName: decision.themeName,
          probability: decision.probability,
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
        // O fornecedor caiu no meio: para aqui e devolve o que já decidiu. O
        // que sobrou continua órfão, e o agrupamento completo resolve.
        result.unavailable = true;
        result.unavailableReason = decision.reason;
        return result;
    }
  }

  return result;
}
