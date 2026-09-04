export const CONVERSATION_TYPE_LABELS = {
  reuniao: 'Reunião',
  treinamento: 'Treinamento',
  informal: 'Informal',
  outro: 'Outro',
} as const;

export const CONVERSATION_STATUS_LABELS = {
  processado: 'Processado',
  pendente: 'Pendente',
  processando: 'Processando',
  erro: 'Erro',
} as const;

export const OPPORTUNITY_TYPE_LABELS = {
  treinamento: 'Treinamento',
  consultoria: 'Consultoria',
  sistema: 'Sistema',
  produto: 'Produto',
  servico: 'Serviço',
} as const;

export const OPPORTUNITY_STATUS_LABELS = {
  nova: 'Nova',
  analise: 'Em análise',
  qualificada: 'Qualificada',
  descartada: 'Descartada',
} as const;

export const CONTENT_FORMAT_LABELS = {
  artigo: 'Artigo',
  post: 'Post',
  carrossel: 'Carrossel',
  roteiro: 'Roteiro',
  blog: 'Artigo',
  linkedin: 'Post',
  youtube: 'Roteiro',
} as const;

export const CONTENT_STATUS_LABELS = {
  sugerido: 'Sugerido',
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  producao: 'Em produção',
  publicado: 'Publicado',
  descartado: 'Descartado',
} as const;

export const PROJECT_STATUS_LABELS = {
  ativo: 'Ativo',
  pausado: 'Pausado',
  arquivado: 'Arquivado',
} as const;

export const PROJECT_TASK_KIND_LABELS = {
  manual: 'Manual',
  aprofundar: 'Aprofundar',
  plano: 'Plano',
  riscos: 'Riscos',
  conteudo: 'Conteúdo',
} as const;

export const ENRICHMENT_SOURCE_TYPE_LABELS = {
  opportunity: 'Novo negócio',
  insight: 'Insight',
  content: 'Conteúdo',
} as const;

type LabelDictionary = Readonly<Record<string, string>>;

/**
 * Converte códigos internos em texto de interface. O fallback nunca deixa um
 * slug começar em minúscula nem exibe sublinhados para o usuário.
 */
export function formatLabel(value: string | null | undefined, labels: LabelDictionary): string {
  if (!value) return '';
  const known = labels[value];
  if (known) return known;

  const readable = value.trim().replace(/[_-]+/g, ' ');
  if (!readable) return '';
  return readable.charAt(0).toLocaleUpperCase('pt-BR') + readable.slice(1);
}

export const formatConversationType = (value: string | null | undefined) =>
  formatLabel(value, CONVERSATION_TYPE_LABELS);

export const formatConversationStatus = (value: string | null | undefined) =>
  formatLabel(value, CONVERSATION_STATUS_LABELS);

export const formatOpportunityType = (value: string | null | undefined) =>
  formatLabel(value, OPPORTUNITY_TYPE_LABELS);

export const formatOpportunityStatus = (value: string | null | undefined) =>
  formatLabel(value, OPPORTUNITY_STATUS_LABELS);

export const formatContentFormat = (value: string | null | undefined) =>
  formatLabel(value, CONTENT_FORMAT_LABELS);

export const formatContentStatus = (value: string | null | undefined) =>
  formatLabel(value, CONTENT_STATUS_LABELS);

export const formatProjectStatus = (value: string | null | undefined) =>
  formatLabel(value, PROJECT_STATUS_LABELS);

export function formatProjectTaskKind(value: string | null | undefined): string {
  const kind = value?.startsWith('ai:') ? value.slice(3) : value;
  return formatLabel(kind, PROJECT_TASK_KIND_LABELS);
}

export const formatEnrichmentSourceType = (value: string | null | undefined) =>
  formatLabel(value, ENRICHMENT_SOURCE_TYPE_LABELS);
