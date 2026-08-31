"use client";
import { createContext, useContext } from "react";

export type EnrichmentSourceType = "opportunity" | "insight" | "content";

/** Dados mínimos da ideia para exibir no modal quando ainda não há override. */
export interface IdeaData {
  title: string;
  originalText: string;
  /** Dor identificada (apenas oportunidades) — exibida como bloco fixo no modal. */
  pain?: string | null;
  /** Contexto do que foi levantado na conversa (apenas oportunidades). */
  context?: string | null;
  /**
   * Ideia já redigida pela IA (apenas oportunidades). Quando ausente e sem
   * textOverride, o modal dispara a geração on-demand via /api/opportunities/idea.
   */
  generatedIdea?: string | null;
  /** Rascunho/texto do artigo (apenas conteúdos) — exibido e editável no modal. */
  draft?: string | null;
  /** Formato do conteúdo (apenas conteúdos), já com o rótulo legível. */
  formatLabel?: string | null;
  /** Subtipo/canal do conteúdo, texto livre (ex.: "LinkedIn"). */
  subtypeLabel?: string | null;
  /** Roteiro/outline do conteúdo, cru como veio do gerador (JSON ou texto). */
  outline?: string | null;
  /** Status do conteúdo, já com o rótulo legível. */
  statusLabel?: string | null;
}

export interface EnrichmentContextValue {
  /** True se (sourceType, sourceId) está marcado como interessante. */
  isInteresting: (sourceType: EnrichmentSourceType, sourceId: string) => boolean;
  /** Abre o modal global de enriquecimento para uma ideia. */
  openEnrichment: (sourceType: EnrichmentSourceType, sourceId: string, idea: IdeaData) => void;
  /** Revalida o conjunto de interessantes (após salvar). */
  refresh: () => void;
}

export const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

/** Acesso ao contexto. Retorna null se não houver provider (fallback seguro). */
export function useEnrichment(): EnrichmentContextValue | null {
  return useContext(EnrichmentContext);
}
