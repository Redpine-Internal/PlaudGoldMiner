import React from "react";
import { Icon } from "./Icon";
import { useEnrichment } from "./enrichment/useEnrichment";

const TYPES: Record<string, { color: string; label: string }> = {
  pattern: { color: "var(--insight-pattern)", label: "Padrão" },
  opportunity: { color: "var(--insight-opportunity)", label: "Oportunidade" },
  suggestion: { color: "var(--insight-suggestion)", label: "Sugestão" },
  trend: { color: "var(--insight-trend)", label: "Tendência" },
  connection: { color: "var(--insight-connection)", label: "Conexão" },
};

export interface InsightCardProps {
  title?: string;
  description?: string;
  insightType?: string;
  actionSuggestion?: string;
  isNew?: boolean;
  onDismiss?: React.MouseEventHandler<HTMLButtonElement>;
  onMarkUseful?: React.MouseEventHandler<HTMLButtonElement>;
  onChat?: React.MouseEventHandler<HTMLButtonElement>;
  /** Slot de ação renderizado dentro do card (ex.: botão de projeto). */
  action?: React.ReactNode;
  sourceId?: string;
  enrichText?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** "Você Sabia?" cross-insight card — gradient bg, colored left border, sparkles header, 💡 action. */
export function InsightCard({
  title,
  description,
  insightType = "pattern",
  actionSuggestion,
  isNew = false,
  onDismiss,
  onMarkUseful,
  onChat,
  action,
  sourceId,
  enrichText,
  style,
  className = "",
}: InsightCardProps) {
  const t = TYPES[insightType] || { color: "var(--color-primary)", label: "Insight" };
  const enrichment = useEnrichment();
  const interesting = enrichment && sourceId ? enrichment.isInteresting("insight", sourceId) : false;
  const handleCardClick = () => {
    if (enrichment && sourceId) {
      enrichment.openEnrichment("insight", sourceId, { title: title ?? "", originalText: enrichText ?? description ?? "" });
    }
  };
  const iconBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 4,
    cursor: "pointer",
    display: "inline-flex",
    borderRadius: "var(--radius)",
  };
  return (
    <div
      className={("ds-insight " + className).trim()}
      onClick={handleCardClick}
      style={{ display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", borderLeftColor: t.color, cursor: sourceId ? "pointer" : undefined, ...style }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkles" size={16} color="var(--color-primary)" />
          <span style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>{t.label}</span>
          {interesting ? <Icon name="star" size={14} color="var(--color-primary)" /> : null}
          {isNew ? (
            <span
              style={{
                padding: "2px 6px",
                font: "400 10px/14px var(--font-sans)",
                background: "var(--color-primary)",
                color: "var(--color-primary-foreground)",
                borderRadius: "var(--radius)",
              }}
            >
              NOVO
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {onChat ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onChat?.(e); }} title="Conversar sobre este insight" style={{ ...iconBtn, color: "var(--brand)" }}>
              <Icon name="ai-chat" size={16} />
            </button>
          ) : null}
          {onMarkUseful ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onMarkUseful?.(e); }} title="Marcar como útil" style={{ ...iconBtn, color: "var(--color-muted-foreground)" }}>
              <Icon name="thumbs-up" size={16} />
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss?.(e); }} title="Dispensar" style={{ ...iconBtn, color: "var(--color-muted-foreground)" }}>
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <h3 style={{ font: "400 18px/24px var(--fontFamily)", marginBottom: 4 }}>{title}</h3>
      <p style={{ margin: "0 0 8px", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{description}</p>
      {actionSuggestion ? (
        <p style={{ margin: 0, font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>💡 {actionSuggestion}</p>
      ) : null}
      {action ? <div style={{ marginTop: "auto", paddingTop: 12 }}>{action}</div> : null}
    </div>
  );
}
