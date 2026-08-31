import { z } from 'zod';

/**
 * Análise de oportunidades sobre um CONJUNTO de conversas.
 *
 * Diferente de `process-transcription` (1 conversa → 1 análise, que também
 * atualiza resumo/tópicos/participantes da conversa), aqui a IA lê várias
 * transcrições de uma vez e devolve oportunidades que podem ser sustentadas por
 * MAIS DE UMA conversa. É isso que permite detectar a dor recorrente que só
 * aparece quando se olha o período inteiro, e não reunião a reunião.
 *
 * Cada oportunidade carrega uma lista de fontes (conversa + trecho literal), que
 * vira 1 linha em app_opportunity_sources por fonte.
 */

const opportunityType = () =>
  z.enum(['treinamento', 'consultoria', 'sistema', 'produto']).catch('consultoria');

export const opportunityBatchSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().describe('Título curto e específico da oportunidade'),
        pain: z.string().describe('Problema ou dor identificada, na linguagem do cliente'),
        context: z
          .string()
          .describe('Contexto: em que situação isso apareceu, considerando TODAS as conversas'),
        type: opportunityType().describe('Tipo: treinamento, consultoria ou sistema'),
        subtype: z
          .string()
          .describe(
            'Subtipo específico e livre, ex. "Treinamento NR-35", "Consultoria em PGR", "Sistema de gestão de EPIs". String vazia se não for possível especificar.'
          ),
        score: z.number().min(0).max(100).describe('Score de confiança 0-100'),
        sources: z
          .array(
            z.object({
              conversationRef: z
                .string()
                .describe('O identificador da conversa (C1, C2...), copiado do atributo ref do bloco'),
              excerpt: z
                .string()
                .describe(
                  'A passagem daquela conversa (1-3 frases) que sustenta a oportunidade. Se o material for a transcrição, cole LITERALMENTE. Se for o resumo, reproduza a frase do resumo que embasa a conclusão.'
                ),
            })
          )
          .describe(
            'Todas as conversas do conjunto que sustentam esta oportunidade, com o trecho de cada uma. Uma oportunidade recorrente deve listar várias.'
          ),
      })
    )
    .describe('Oportunidades de negócio identificadas no conjunto'),
});

export type OpportunityBatchResult = z.infer<typeof opportunityBatchSchema>;

export const OPPORTUNITY_BATCH_SYSTEM_PROMPT = `Você é um analista de negócios da EHS Brasil, especializada em segurança do trabalho, saúde ocupacional e meio ambiente.

Você recebe um CONJUNTO de transcrições de conversas e deve identificar oportunidades de negócio olhando o conjunto como um todo — não conversa por conversa.

O que a EHS Brasil vende:
- treinamento: cursos, capacitações, reciclagens, NRs
- consultoria: diagnósticos, laudos, programas (PGR, PCMSO), assessoria e projetos
- sistema: software, plataformas, ferramentas digitais de gestão
- produto: itens físicos — EPIs, sinalização, equipamentos, kits

REGRA DE RECORRÊNCIA (a mais importante de todas):
Uma oportunidade só existe se a MESMA dor aparecer em DUAS OU MAIS conversas do
conjunto. Dor que aparece em uma conversa só é caso isolado, não oportunidade de
negócio — descarte, por mais explícita e bem contextualizada que ela seja.
Exceção única: se o conjunto tem apenas UMA conversa, aí sim uma fonte basta.

Como analisar:
1. Leia todas as conversas antes de concluir qualquer coisa.
2. Procure o que se REPETE. O valor desta análise está em enxergar o padrão que
   nenhuma reunião isolada revela.
3. Agrupe agressivamente: se a mesma dor aparece em três conversas com palavras
   diferentes, é UMA oportunidade com três fontes, não três oportunidades.
   Na dúvida entre agrupar e separar, AGRUPE.
4. Para cada oportunidade, liste em sources TODAS as conversas que a sustentam,
   com o trecho literal de cada uma.
5. Não invente. Se a dor não está explícita no material, não crie a oportunidade.
6. Devolva no máximo 8 oportunidades por conjunto — as mais recorrentes. É melhor
   devolver 3 oportunidades sólidas do que 20 rasas. Lista vazia é uma resposta
   legítima quando nada se repete.

Regras dos campos:
- type: apenas "treinamento", "consultoria", "sistema" ou "produto".
- subtype: texto livre e específico (ex.: "Treinamento NR-35"); string vazia se não souber.
- sources[].conversationRef: copie o valor do atributo ref do bloco da conversa (C1, C2...), sem colchetes. Nunca invente um identificador que não foi apresentado.
- sources: mínimo de DUAS conversas distintas quando o conjunto tem mais de uma
  conversa. Nunca repita a mesma conversa duas vezes para atingir o mínimo — se
  só há uma conversa sustentando a dor, a oportunidade não deve ser criada.
- sources[].excerpt: copie a passagem do material daquela conversa, sem parafrasear e sem juntar partes distantes. Quando o material for a transcrição, o trecho tem que ser literal.

O material de cada conversa vem de uma destas duas formas:
- a transcrição completa, quando ela cabe na análise;
- o resumo com os tópicos, quando o conjunto é grande demais para as transcrições inteiras.
Os dois servem para identificar a dor. Analise igual, sem comentar qual forma recebeu.

Score de confiança — a recorrência é o que manda:
- 90-100: dor explícita em 4+ conversas, com intenção declarada de resolver
- 70-89: dor explícita em 3 conversas
- 50-69: dor presente em 2 conversas, ao menos uma delas explícita
- 0-49: dor em 2 conversas, mas implícita ou sugerida nas duas

Prefira poucas oportunidades bem sustentadas a muitas oportunidades rasas.`;

export interface BatchConversationInput {
  /** Identificador curto usado no prompt e devolvido em sources[].conversationRef. */
  ref: string;
  title: string | null;
  date: string | null;
  /** Material da conversa: transcrição integral ou extrato (resumo + tópicos). */
  content: string;
  /** Qual dos dois foi enviado — vira atributo do bloco. */
  form: 'transcricao' | 'resumo';
}

/** Monta o prompt do conjunto, rotulando cada conversa com seu ref. */
export function createOpportunityBatchPrompt(items: BatchConversationInput[]): string {
  const blocks = items
    .map(
      (c) =>
        `<conversa ref="${c.ref}" titulo="${(c.title ?? 'Sem título').replace(/"/g, "'")}" data="${c.date ?? 'sem data'}" material="${c.form}">
${c.content}
</conversa>`
    )
    .join('\n\n');

  const plural = items.length === 1 ? 'a conversa a seguir' : `as ${items.length} conversas a seguir`;

  return `Analise ${plural} como um conjunto e extraia as oportunidades de negócio.

${blocks}

Lembre-se: agrupe dores equivalentes em uma única oportunidade e cite em sources todas as conversas que a sustentam, usando o ref exato de cada uma.`;
}
