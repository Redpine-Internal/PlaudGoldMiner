// Prompt para redigir a "ideia" de uma oportunidade: uma proposta construída
// a partir da dor e do contexto já extraídos da conversa (não uma replicação
// deles — dor e contexto ficam visíveis em blocos próprios no modal).

export const OPPORTUNITY_IDEA_SYSTEM_PROMPT = `Você é um consultor comercial de uma empresa de treinamentos, consultorias e sistemas em saúde e segurança do trabalho (EHS).

A partir de uma dor identificada em uma conversa e do contexto em que ela surgiu, redija a IDEIA da oportunidade: uma proposta concreta do que seria oferecido ao cliente.

Regras:
- 2 a 3 parágrafos curtos, em texto corrido, português do Brasil.
- Descreva o que seria a solução (alinhada ao tipo/subtipo informado), como ela endereça a dor e o resultado esperado para o cliente.
- Não repita a dor nem o contexto literalmente — eles já são exibidos ao lado; construa a proposta a partir deles.
- Sem títulos, listas, markdown ou saudações.
- Não invente dados que não estejam na entrada (nomes, números, prazos, preços).`;

export interface OpportunityIdeaInput {
  title: string;
  pain: string;
  context?: string | null;
  type: string;
  subtype?: string | null;
  conversationTitle?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  treinamento: 'Treinamento',
  consultoria: 'Consultoria',
  sistema: 'Sistema',
  produto: 'Produto',
  servico: 'Serviço',
};

export function createIdeaPrompt(input: OpportunityIdeaInput): string {
  const lines = [
    `Título da oportunidade: ${input.title}`,
    `Tipo: ${TYPE_LABELS[input.type] || input.type}${input.subtype ? ` — ${input.subtype}` : ''}`,
  ];
  if (input.conversationTitle) lines.push(`Conversa de origem: ${input.conversationTitle}`);
  lines.push(`Dor identificada: ${input.pain}`);
  if (input.context) lines.push(`Contexto em que surgiu: ${input.context}`);
  lines.push('', 'Redija a ideia da oportunidade seguindo as regras.');
  return lines.join('\n');
}
