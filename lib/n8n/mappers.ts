// Mappers puros: achatam as linhas cruas das tabelas dos agentes n8n nos "cards"
// que a UI já consome. Sem I/O — testáveis sem banco. Leitura defensiva: campo
// ausente nunca quebra (o formato exato do jsonb ainda não foi visto em produção).
//
// O driver pg devolve text[] como array JS e jsonb como objeto/array JS já
// parseado — os mappers NÃO re-parseiam esses campos.

// ---- Tipos de card (espelham o shape que as rotas app_* retornam hoje) ----
// conversationTitle/conversationDate são preenchidos pela rota (enriquecimento),
// não pelo mapper; ficam opcionais aqui.

export interface OpportunityCard {
  id: string;
  title: string;
  pain: string;
  context: string | null;
  score: number;
  type: string;
  status: string;
  notes: string | null;
  tags: string | null;
  conversationId: string | null;
  conversationTitle?: string | null;
  conversationDate?: string | null;
  createdAt: string;
}

export interface ContentCard {
  id: string;
  title: string;
  /** Formato do conteúdo: artigo | post | carrossel | roteiro (coluna legada `platform`). */
  platform: string;
  /** Variação livre dentro do formato (ex.: "LinkedIn"). Ausente nas fontes n8n. */
  subtype?: string | null;
  theme: string;
  outline: string; // JSON: { body, hashtags, imagePrompt }
  mentionCount: number;
  relevanceScore: number;
  status: string;
  notes: string | null;
  conversationId: string | null;
  conversationTitle?: string | null;
  conversationDate?: string | null;
  createdAt: string;
}

export interface CrossInsightCard {
  id: string;
  title: string;
  description: string;
  pattern: string;
  insightType: string;
  confidence: number;
  status: string;
  actionSuggestion: string | null;
  conversationIds: string; // JSON array de meeting ids
  conversationId: string | null; // primeiro id (para enrichWithConversation)
  conversationTitle?: string | null;
  conversationDate?: string | null;
  createdAt: string;
  // Campos de qualificação (reunião 2026-08-25) — presentes só na fonte local.
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
  isHypothesis?: boolean;
  notes?: string | null;
}

// ---- Linhas cruas do banco (só os campos que os mappers usam) ----
export interface BusinessOpportunityRow {
  id: string;
  meeting_ids: string[] | null;
  opportunities: unknown; // jsonb: esperado array de itens
  created_at: string;
}
export interface SocialPostRow {
  id: string;
  meeting_ids: string[] | null;
  platform?: string | null;
  content_type?: string | null;
  title?: string | null;
  body?: string | null;
  hashtags?: unknown; // jsonb
  image_prompt?: string | null;
  created_at: string;
}
export interface ArticleInsightRow {
  id: string;
  meeting_ids: string[] | null;
  title?: string | null;
  abstract_text?: string | null;
  focus_area?: string | null;
  created_at: string;
}

/** business_opportunities → OpportunityCard[] (achatamento 1→N: cada item do jsonb vira 1 card). */
export function mapBusinessOpportunities(
  rows: BusinessOpportunityRow[]
): OpportunityCard[] {
  return rows.flatMap((row) => {
    const items = Array.isArray(row.opportunities)
      ? (row.opportunities as Record<string, unknown>[])
      : [];
    const conversationId = row.meeting_ids?.[0] ?? null;
    return items.map((it, i) => ({
      id: typeof it.id === 'string' ? it.id : `${row.id}:${i}`,
      title: typeof it.title === 'string' ? it.title : 'Sem título',
      pain: typeof it.pain === 'string' ? it.pain : '',
      context: typeof it.context === 'string' ? it.context : null,
      score: Number(it.score ?? 0),
      type: typeof it.type === 'string' ? it.type : 'produto',
      status: typeof it.status === 'string' ? it.status : 'nova',
      notes: null,
      tags: null,
      conversationId,
      createdAt: row.created_at,
    }));
  });
}

/** social_posts → ContentCard[] (1 linha = 1 card). */
export function mapSocialPosts(rows: SocialPostRow[]): ContentCard[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    platform: row.platform ?? '',
    theme: row.content_type ?? '',
    // A UI (ContentCard.parseOutline) renderiza { angle, points[] }: `angle` sai
    // em itálico como gancho, `points` vira lista. Mapeamos body→angle e hashtags→points
    // para o card renderizar limpo em vez de despejar o JSON cru. (image_prompt não tem
    // lugar neste card; fica de fora do outline visível.)
    outline: JSON.stringify({
      angle: row.body ?? '',
      points: Array.isArray(row.hashtags) ? row.hashtags.map(String) : [],
    }),
    mentionCount: 1, // social_posts não tem colunas de menção/relevância; UI usa defaults
    relevanceScore: 0,
    status: 'sugerido',
    notes: null,
    conversationId: row.meeting_ids?.[0] ?? null,
    createdAt: row.created_at,
  }));
}

/** article_insights → CrossInsightCard[] (1 linha = 1 card). */
export function mapArticleInsights(rows: ArticleInsightRow[]): CrossInsightCard[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    description: row.abstract_text ?? '',
    // n8n só traz focus_area; alimenta pattern E insightType até o schema ter dados mais ricos
    pattern: row.focus_area ?? 'geral',
    insightType: row.focus_area ?? 'geral',
    confidence: 0,
    status: 'new',
    actionSuggestion: null,
    conversationIds: JSON.stringify(row.meeting_ids ?? []),
    conversationId: row.meeting_ids?.[0] ?? null,
    createdAt: row.created_at,
  }));
}
