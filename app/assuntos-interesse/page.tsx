"use client";
import useSWR from "swr";
import { useEnrichment, EmptyState } from "@/components/ds";
import { GlassList, GlassListRow } from "@/components/lg/GlassList";

interface InterestingItem {
  enrichmentId: string;
  sourceType: "opportunity" | "insight" | "content";
  sourceId: string;
  notes: string | null;
  textOverride: string | null;
  updatedAt: string;
  refCount: number;
  title: string | null;
  subtitle: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TYPE_LABEL: Record<string, string> = {
  opportunity: "Novo Negócio",
  insight: "Insight",
  content: "Conteúdo",
};

const TYPE_FG: Record<string, string> = {
  opportunity: "var(--badge-navy)",
  insight: "var(--badge-orange)",
  content: "var(--badge-green)",
};

export default function AssuntosInteressePage() {
  const enrichment = useEnrichment();
  const { data, isLoading } = useSWR<{ data: InterestingItem[] }>(
    "/api/enrichment/interesting",
    fetcher,
    { revalidateOnFocus: false }
  );
  const items = data?.data || [];

  return (
    <div className="pgm-topics-page">
      <header className="pgm-topics-hero">
        <p className="pgm-page-eyebrow">Mesa de temas acompanhados</p>
        <h1>Assuntos de Interesse</h1>
        {!isLoading ? <span>{items.length} {items.length === 1 ? "assunto" : "assuntos"}</span> : null}
        <p>
          Ideias marcadas como interessantes, de todas as áreas.
        </p>
      </header>

      {isLoading ? (
        <GlassList>
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassListRow key={i}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
                <div className="ds-skeleton" style={{ height: 12, width: "38%", borderRadius: 6 }} />
                <div className="ds-skeleton" style={{ height: 10, width: "64%", borderRadius: 6 }} />
              </div>
            </GlassListRow>
          ))}
        </GlassList>
      ) : items.length ? (
        <GlassList className="pgm-topics-list">
          {items.map((it) => (
            <GlassListRow
              key={it.enrichmentId}
              className="pgm-topic-row"
              hideChevron
              aria-label={it.title || "(sem título)"}
              onClick={() =>
                enrichment?.openEnrichment(it.sourceType, it.sourceId, {
                  title: it.title ?? "Ideia",
                  originalText: it.textOverride ?? it.subtitle ?? "",
                })
              }
            >
              <div className="pgm-topic-row__source">
                <span style={{ color: TYPE_FG[it.sourceType] || "var(--badge-gray)" }}>{TYPE_LABEL[it.sourceType] || it.sourceType}</span>
                <small>{it.sourceId.slice(0, 8)}</small>
              </div>
              <div className="pgm-topic-row__main">
                <strong>{it.title || "(sem título)"}</strong>
                {it.subtitle ? <span>{it.subtitle}</span> : null}
              </div>
              <span className="pgm-topic-row__updated">Atualizado: {it.updatedAt ? new Date(it.updatedAt).toLocaleDateString("pt-BR") : "não informado"}</span>
              <span className="pgm-topic-row__refs">{it.refCount} referência{it.refCount !== 1 ? "s" : ""}</span>
              <span className="pgm-topic-row__notes">{it.notes || "sem observações"}</span>
            </GlassListRow>
          ))}
        </GlassList>
      ) : (
        <EmptyState icon="star" title="Nenhum assunto de interesse" message="Marque ideias como interessantes nos cards para vê-las aqui." />
      )}
    </div>
  );
}
