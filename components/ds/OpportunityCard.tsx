import React from "react";

const STATUS: Record<string, string> = { nova: "Nova", analise: "Em análise", qualificada: "Qualificada", descartada: "Descartada" };
const TYPES: Record<string, string> = { produto: "Produto", sistema: "Sistema", consultoria: "Consultoria", servico: "Serviço" };

export interface OpportunityCardProps {
  title?: string;
  pain?: string;
  type?: string;
  status?: string;
  score?: number;
  conversationTitle?: string;
  createdAt?: string | Date;
  selected?: boolean;
  onSelect?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

/** Opportunity list card — labels, chips and meta row from app/oportunidades. */
export function OpportunityCard({
  title,
  pain,
  type = "produto",
  status = "nova",
  score = 0,
  conversationTitle,
  createdAt,
  selected = false,
  onSelect,
  style,
  className = "",
}: OpportunityCardProps) {
  const fmt = (ds: string | Date) =>
    new Date(ds).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div
      onClick={onSelect}
      className={["ds-card ds-card--clickable", selected ? "ds-card--selected" : "", className].filter(Boolean).join(" ")}
      style={style}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <h3 style={{ font: "400 16px/24px var(--fontFamily)" }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${type}-bg)`, color: `var(--opp-${type}-fg)` }}>
            {TYPES[type] || type}
          </span>
          <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${status}-bg)`, color: `var(--opp-${status}-fg)` }}>
            {STATUS[status] || status}
          </span>
        </div>
      </div>
      <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
        <span style={{ font: "500 12px/20px var(--font-sans)" }}>
          {createdAt ? fmt(createdAt) + " · " : ""}Score {Math.round(score)}%
          {conversationTitle ? " · De: " + conversationTitle : ""}
        </span>
        {" · "}
        {pain}
      </p>
    </div>
  );
}
