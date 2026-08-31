/**
 * Procedência do trecho que sustenta um negócio.
 *
 * Um trecho pode ser fala literal de alguém na reunião ou paráfrase escrita pela
 * IA no resumo — e o usuário leva esse texto para uma reunião comercial. Exibir
 * paráfrase entre aspas o faz atribuir a um cliente uma frase que ninguém disse,
 * então a origem precisa acompanhar o texto.
 *
 * O marcador viaja como prefixo do próprio `excerpt` porque
 * `app_opportunity_sources` não tem coluna para isso e uma migração só para um
 * booleano não se paga. O prefixo é removido na leitura e nunca chega à tela.
 */

/**
 * Só o caso confirmado é marcado. Os trechos gravados antes desta mudança não
 * têm o prefixo e, corretamente, são tratados como não confirmados: a maioria
 * veio do modo resumo, e para os que vieram da fala o custo é uma citação a
 * menos — nunca uma citação falsa a mais.
 */
const MARCA_FALA = '[fala] ';

/** Prefixa o trecho quando ele é fala localizada na transcrição. */
export function marcarProcedencia(excerpt: string | null, daTranscricao: boolean): string | null {
  if (!excerpt) return excerpt;
  return daTranscricao ? `${MARCA_FALA}${excerpt}` : excerpt;
}

export interface TrechoComProcedencia {
  /** Texto limpo, pronto para exibição. */
  texto: string | null;
  /** `true` apenas quando se sabe que é fala transcrita da reunião. */
  daTranscricao: boolean;
}

/** Separa o marcador do texto. Aceita trechos antigos, sem marcador. */
export function lerProcedencia(excerpt: string | null): TrechoComProcedencia {
  if (!excerpt) return { texto: excerpt, daTranscricao: false };
  if (excerpt.startsWith(MARCA_FALA)) {
    return { texto: excerpt.slice(MARCA_FALA.length), daTranscricao: true };
  }
  return { texto: excerpt, daTranscricao: false };
}
