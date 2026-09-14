export const CONVERSATION_CLASSIFICATIONS = [
  { value: 'nao_classificado', label: 'Não classificada', miningEligible: false },
  { value: 'reuniao_comercial', label: 'Reunião comercial', miningEligible: true },
  { value: 'diagnostico', label: 'Diagnóstico ou descoberta', miningEligible: true },
  { value: 'projeto_cliente', label: 'Projeto ou consultoria com cliente', miningEligible: true },
  { value: 'mentoria', label: 'Mentoria com cliente', miningEligible: true },
  { value: 'reuniao_interna', label: 'Reunião interna', miningEligible: true },
  { value: 'treinamento', label: 'Treinamento', miningEligible: false },
  { value: 'outro', label: 'Outro', miningEligible: false },
  // Valores legados: permanecem válidos para não bloquear o acervo já existente.
  { value: 'reuniao', label: 'Reunião', miningEligible: true },
  { value: 'informal', label: 'Conversa informal', miningEligible: true },
] as const;

export type ConversationType = (typeof CONVERSATION_CLASSIFICATIONS)[number]['value'];

export const CONVERSATION_TYPE_VALUES = CONVERSATION_CLASSIFICATIONS.map(
  ({ value }) => value
) as [ConversationType, ...ConversationType[]];

export const MINING_ELIGIBLE_CONVERSATION_TYPES = CONVERSATION_CLASSIFICATIONS
  .filter(({ miningEligible }) => miningEligible)
  .map(({ value }) => value) as ConversationType[];

export function isMiningEligibleConversationType(type: string | null | undefined): boolean {
  return CONVERSATION_CLASSIFICATIONS.some(
    (classification) => classification.value === type && classification.miningEligible
  );
}

/** Use apenas com nomes de coluna definidos no código, nunca com entrada do usuário. */
export function miningEligibleSql(column: string): string {
  const values = MINING_ELIGIBLE_CONVERSATION_TYPES
    .map((value) => `'${value}'`)
    .join(', ');
  return `${column} IN (${values})`;
}

export function opportunityHasEligibleSourceSql(opportunityAlias = 'o'): string {
  return `(
    EXISTS (
      SELECT 1
        FROM app_opportunity_sources eligible_source
        JOIN conversations eligible_conversation
          ON eligible_conversation.id::text = eligible_source.conversation_id::text
       WHERE eligible_source.opportunity_id::text = ${opportunityAlias}.id::text
         AND ${miningEligibleSql('eligible_conversation.type')}
    )
    OR EXISTS (
      SELECT 1
        FROM conversations eligible_direct_conversation
       WHERE eligible_direct_conversation.id::text = ${opportunityAlias}.conversation_id::text
         AND ${miningEligibleSql('eligible_direct_conversation.type')}
    )
  )`;
}

export function contentIsEligibleSql(contentAlias = 'c'): string {
  return `(
    NOT EXISTS (
      SELECT 1 FROM app_content_sources any_source
       WHERE any_source.content_id::text = ${contentAlias}.id::text
    )
    OR EXISTS (
      SELECT 1
        FROM app_content_sources eligible_source
        JOIN conversations eligible_conversation
          ON eligible_conversation.id::text = eligible_source.conversation_id::text
       WHERE eligible_source.content_id::text = ${contentAlias}.id::text
         AND ${miningEligibleSql('eligible_conversation.type')}
    )
  )`;
}
