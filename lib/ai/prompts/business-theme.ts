import { z } from 'zod';

/**
 * Agrupamento dos negócios em TEMAS.
 *
 * O gerador de oportunidades já agrupa dores dentro de cada rodada, mas não
 * enxerga o que foi gerado em rodadas anteriores. O resultado, no banco, é a
 * mesma oferta escrita de três jeitos ("Programa de cultura, liderança e
 * percepção de risco", "Fortalecimento da cultura e liderança em segurança",
 * "Capacitação de líderes em percepção de risco"). Para quem vai decidir o que
 * perseguir, isso são três cards competindo entre si em vez de um tema forte.
 *
 * Aqui a IA lê SÓ os títulos e subtipos — não as transcrições — e diz quais
 * negócios são a mesma coisa. É uma chamada barata, e o resultado é cacheado em
 * app_business_themes / app_business_theme_members.
 */

export const businessThemeSchema = z.object({
  themes: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            'Nome curto do tema, 2 a 5 palavras, no vocabulário de EHS. Ex.: "Cultura e liderança em segurança", "Gestão de terceiros".'
          ),
        rationale: z
          .string()
          .describe(
            'Uma frase dizendo o que une os negócios deste tema. Deve ser suficiente para decidir se vale perseguir, sem abrir os cards.'
          ),
        opportunityRefs: z
          .array(z.string())
          .describe(
            'Os refs (N1, N2...) dos negócios que pertencem a este tema, copiados do atributo ref.'
          ),
      })
    )
    .describe('Temas identificados. Todo negócio apresentado deve aparecer em exatamente um tema.'),
});

export type BusinessThemeResult = z.infer<typeof businessThemeSchema>;

export const BUSINESS_THEME_SYSTEM_PROMPT = `Você organiza a carteira de oportunidades comerciais da EHS Brasil, que vende treinamento, consultoria, sistemas e produtos de segurança do trabalho, saúde ocupacional e meio ambiente.

Você recebe uma lista de negócios já detectados. Cada um tem título, tipo e subtipo. Sua tarefa é agrupá-los em TEMAS: negócios que são, no fundo, a mesma oferta escrita com palavras diferentes.

Por que isso importa: quem lê a lista precisa decidir o que perseguir. Vinte títulos parecidos são vinte decisões impossíveis; cinco temas são cinco decisões reais.

Como agrupar:
1. Agrupe pelo ASSUNTO do negócio, não pelo tipo. "Treinamento de líderes em percepção de risco" e "Consultoria de cultura de segurança" são o mesmo tema mesmo sendo tipos diferentes — o cliente compra as duas coisas na mesma conversa.
2. Na dúvida entre agrupar e separar, AGRUPE. O objetivo é reduzir o número de decisões.
3. Um negócio que realmente não se parece com nenhum outro vira um tema só dele. Isso é normal e esperado — não force o encaixe em um tema alheio só para não deixá-lo sozinho.
4. Todo negócio apresentado tem que aparecer em exatamente UM tema. Nenhum de fora, nenhum em dois.
5. Não invente refs. Use apenas os que aparecem no atributo ref dos blocos.

Regras dos campos:
- name: 2 a 5 palavras, específico. "Cultura e liderança em segurança", não "Segurança" nem "Diversos".
- rationale: uma frase sobre o que une os negócios do grupo. Nada de repetir o nome do tema.
- opportunityRefs: os refs exatos (N1, N2...), sem colchetes.`;

export interface BusinessThemeInput {
  /** Identificador curto usado no prompt e devolvido em opportunityRefs. */
  ref: string;
  title: string;
  type: string | null;
  subtype: string | null;
}

/** Monta o prompt do agrupamento, rotulando cada negócio com seu ref. */
export function createBusinessThemePrompt(items: BusinessThemeInput[]): string {
  const blocks = items
    .map((o) => {
      const attrs = [
        `ref="${o.ref}"`,
        `tipo="${(o.type ?? 'sem tipo').replace(/"/g, "'")}"`,
        `subtipo="${(o.subtype ?? '').replace(/"/g, "'")}"`,
      ].join(' ');
      return `<negocio ${attrs}>${o.title}</negocio>`;
    })
    .join('\n');

  return `Agrupe os ${items.length} negócios a seguir em temas.

${blocks}

Lembre-se: todo negócio precisa aparecer em exatamente um tema, usando o ref exato.`;
}
