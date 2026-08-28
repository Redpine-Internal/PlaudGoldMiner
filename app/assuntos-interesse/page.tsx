"use client";
import useSWR from "swr";
import { Star, StickyNote } from "lucide-react";
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
  opportunity: "Oportunidade",
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
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.022em",
            }}
          >
            Assuntos de Interesse
          </h1>
          {!isLoading && items.length > 0 ? (
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>
              {items.length} {items.length === 1 ? "assunto" : "assuntos"}
            </span>
          ) : null}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: "20px", color: "var(--color-muted-foreground)" }}>
          Ideias marcadas como interessantes, de todas as áreas.
        </p>
      </div>

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
        <GlassList>
          {items.map((it) => (
            <GlassListRow
              key={it.enrichmentId}
              aria-label={it.title || "(sem título)"}
              onClick={() =>
                enrichment?.openEnrichment(it.sourceType, it.sourceId, {
                  title: it.title ?? "Ideia",
                  originalText: it.textOverride ?? it.subtitle ?? "",
                })
              }
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Star
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ color: "var(--brand)", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.title || "(sem título)"}
                  </span>
                  <span
                    className="ds-badge ds-badge--compact"
                    style={{
                      background: "var(--badge-bg)",
                      color: TYPE_FG[it.sourceType] || "var(--badge-gray)",
                      flexShrink: 0,
                    }}
                  >
                    {TYPE_LABEL[it.sourceType] || it.sourceType}
                  </span>
                </div>
                {it.subtitle ? (
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--color-muted-foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.subtitle}
                  </span>
                ) : null}
                {it.notes ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      color: "var(--color-muted-foreground)",
                      minWidth: 0,
                    }}
                  >
                    <StickyNote size={13} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.notes}</span>
                  </span>
                ) : null}
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 12, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>
                  {it.refCount} referência{it.refCount !== 1 ? "s" : ""}
                </span>
              </div>
            </GlassListRow>
          ))}
        </GlassList>
      ) : (
        <EmptyState icon="star" title="Nenhum assunto de interesse" message="Marque ideias como interessantes nos cards para vê-las aqui." />
      )}
    </div>
  );
}
