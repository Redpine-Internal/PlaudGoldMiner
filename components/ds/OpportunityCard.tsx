import React from "react";
import { Icon } from "./Icon";
import { useEnrichment } from "./enrichment/useEnrichment";

const STATUS: Record<string, string> = { nova: "Nova", analise: "Em análise", qualificada: "Qualificada", descartada: "Descartada" };
const TYPES: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema", produto: "Produto", servico: "Serviço" };

/** Compõe o texto padrão do enriquecimento a partir dos campos da oportunidade. */
function buildEnrichText(opts: {
  type?: string;
  subtype?: string | null;
  pain?: string;
  context?: string | null;
  conversationTitle?: string;
}): string {
  const label = TYPES[opts.type ?? ""] || opts.type || "";
  const head =
    `Oportunidade de ${label.toLowerCase()}` +
    (opts.subtype ? ` — ${opts.subtype}` : "") +
    (opts.conversationTitle ? `, identificada na conversa "${opts.conversationTitle}"` : "") +
    ".";
  const parts = [head];
  if (opts.pain) parts.push(`Dor identificada: ${opts.pain}`);
  if (opts.context) parts.push(`Contexto: ${opts.context}`);
  return parts.join("\n\n");
}

export interface OpportunityCardProps {
  title?: string;
  pain?: string;
  context?: string | null;
  type?: string;
  subtype?: string | null;
  status?: string;
  score?: number;
  conversationTitle?: string;
  createdAt?: string | Date;
  selected?: boolean;
  onSelect?: React.MouseEventHandler<HTMLDivElement>;
  sourceId?: string;
  enrichText?: string;
  /** Slot de ação renderizado dentro do card (ex.: botão de projeto). */
  action?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/** Opportunity list card — labels, chips and meta row from app/oportunidades. */
export function OpportunityCard({
  title,
  pain,
  context,
  type = "produto",
  subtype,
  status = "nova",
  score = 0,
  conversationTitle,
  createdAt,
  selected = false,
  onSelect,
  sourceId,
  enrichText,
  action,
  style,
  className = "",
}: OpportunityCardProps) {
  const fmt = (ds: string | Date) =>
    new Date(ds).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const enrichment = useEnrichment();
  const interesting = enrichment && sourceId ? enrichment.isInteresting("opportunity", sourceId) : false;
  const handleCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (enrichment && sourceId) {
      enrichment.openEnrichment("opportunity", sourceId, {
        title: title ?? "",
        originalText: enrichText ?? buildEnrichText({ type, subtype, pain, context, conversationTitle }),
        pain,
        context,
      });
    }
    onSelect?.(e);
  };
  return (
    <div
      onClick={handleCardClick}
      className={["ds-card ds-card--clickable", selected ? "ds-card--selected" : "", className].filter(Boolean).join(" ")}
      style={{ display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", ...style }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <h3 style={{ font: "600 16px/24px var(--fontFamily)" }}>{title}</h3>
        {interesting ? <Icon name="star" size={16} color="var(--brand)" /> : null}
      </div>
      <span style={{ font: "500 12px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
        {createdAt ? fmt(createdAt) + " · " : ""}Score {Math.round(score)}%
        {conversationTitle ? " · De: " + conversationTitle : ""}
      </span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, marginTop: "auto", paddingTop: 12 }}>
        {subtype ? (
          <span
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
              font: "400 12px/16px var(--font-sans)",
              color: "var(--color-muted-foreground)",
            }}
          >
            <Icon name="tag" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{subtype}</span>
          </span>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${type}-bg)`, color: `var(--opp-${type}-fg)` }}>
            {TYPES[type] || type}
          </span>
          <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${status}-bg)`, color: `var(--opp-${status}-fg)` }}>
            {STATUS[status] || status}
          </span>
        </div>
      </div>
      {action ? <div style={{ paddingTop: 12 }}>{action}</div> : null}
    </div>
  );
}
