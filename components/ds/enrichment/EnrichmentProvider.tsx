"use client";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  EnrichmentContext,
  type EnrichmentSourceType,
  type IdeaData,
} from "./useEnrichment";
import { IdeaEnrichmentModal } from "./IdeaEnrichmentModal";

interface InterestingItem {
  sourceType: string;
  sourceId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

  const openEnrichment = useCallback(
    (sourceType: EnrichmentSourceType, sourceId: string, idea: IdeaData) =>
      setOpen({ sourceType, sourceId, idea }),
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
        />
      ) : null}
    </EnrichmentContext.Provider>
  );
}
