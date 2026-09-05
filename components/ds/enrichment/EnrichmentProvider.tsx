"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  EnrichmentContext,
  type EnrichmentSourceType,
  type IdeaData,
} from "./useEnrichment";
import { IdeaEnrichmentModal } from "./IdeaEnrichmentModal";
import { fetchJson } from "@/lib/http";

interface InterestingItem {
  sourceType: string;
  sourceId: string;
}

const fetcher = (url: string) => fetchJson<{ data: InterestingItem[] }>(url);

interface OpenState {
  sourceType: EnrichmentSourceType;
  sourceId: string;
  idea: IdeaData;
}

export function EnrichmentProvider({ children }: { children: React.ReactNode }) {
  const { data, mutate } = useSWR<{ data: InterestingItem[] }>(
    "/api/enrichment/interesting",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [open, setOpen] = useState<OpenState | null>(null);

  const interestingSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of data?.data || []) s.add(`${it.sourceType}:${it.sourceId}`);
    return s;
  }, [data]);

  const isInteresting = useCallback(
    (sourceType: EnrichmentSourceType, sourceId: string) =>
      interestingSet.has(`${sourceType}:${sourceId}`),
    [interestingSet]
  );

  // Ideias já geradas nesta sessão. O servidor persiste em generated_idea, mas a
  // lista que alimenta os cards só é revalidada de vez em quando — sem este cache
  // o card continua passando generatedIdea=null e o modal reabre em "gerando"
  // (a rota devolve o texto do banco, então não gasta IA, mas o usuário vê o
  // spinner de novo). Ref em vez de state: preencher não deve re-renderizar.
  const ideaCache = useRef(new Map<string, string>());

  const rememberIdea = useCallback((sourceId: string, generated: string) => {
    ideaCache.current.set(sourceId, generated);
  }, []);

  const openEnrichment = useCallback(
    (sourceType: EnrichmentSourceType, sourceId: string, idea: IdeaData) => {
      const cached = ideaCache.current.get(sourceId);
      setOpen({
        sourceType,
        sourceId,
        idea: cached && !idea.generatedIdea ? { ...idea, generatedIdea: cached } : idea,
      });
    },
    []
  );

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const value = useMemo(
    () => ({ isInteresting, openEnrichment, refresh }),
    [isInteresting, openEnrichment, refresh]
  );

  return (
    <EnrichmentContext.Provider value={value}>
      {children}
      {open ? (
        <IdeaEnrichmentModal
          sourceType={open.sourceType}
          sourceId={open.sourceId}
          idea={open.idea}
          onClose={() => setOpen(null)}
          onSaved={refresh}
          onIdeaGenerated={rememberIdea}
        />
      ) : null}
    </EnrichmentContext.Provider>
  );
}
