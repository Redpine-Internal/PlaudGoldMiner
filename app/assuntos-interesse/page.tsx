"use client";
import useSWR from "swr";
import { useEnrichment, EmptyState, Icon } from "@/components/ds";

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
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Assuntos de Interesse</h1>
        <p style={{ color: "var(--color-muted-foreground)", margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>
          Ideias marcadas como interessantes, de todas as áreas.
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 140 }} />
          ))}
        </div>
      ) : items.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {items.map((it) => (
            <div
              key={it.enrichmentId}
              className="ds-card ds-card--clickable"
              style={{ display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}
              onClick={() =>
                enrichment?.openEnrichment(it.sourceType, it.sourceId, {
                  title: it.title ?? "Ideia",
                  originalText: it.textOverride ?? it.subtitle ?? "",
                })
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="star" size={16} color="var(--brand)" />
                <span className="ds-badge ds-badge--compact">{TYPE_LABEL[it.sourceType] || it.sourceType}</span>
              </div>
              <h3 style={{ font: "400 16px/24px var(--fontFamily)", margin: 0 }}>{it.title || "(sem título)"}</h3>
              {it.subtitle ? (
                <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{it.subtitle}</p>
              ) : null}
              {it.notes ? (
                <p style={{ margin: 0, font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>📝 {it.notes}</p>
              ) : null}
              <span style={{ marginTop: "auto", font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                {it.refCount} referência{it.refCount !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="star" title="Nenhum assunto de interesse" message="Marque ideias como interessantes nos cards para vê-las aqui." />
      )}
    </div>
  );
}
