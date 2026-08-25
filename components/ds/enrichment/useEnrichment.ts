"use client";
import { createContext, useContext } from "react";

export type EnrichmentSourceType = "opportunity" | "insight" | "content";

/** Dados mínimos da ideia para exibir no modal quando ainda não há override. */
export interface IdeaData {
  title: string;
  originalText: string;
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
