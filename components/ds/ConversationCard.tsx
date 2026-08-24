import React from "react";
import { TypeBadge } from "./TypeBadge";
import { StatusBadge } from "./StatusBadge";

export interface ConversationCardProps {
  title?: string;
  date?: string | Date;
  duration?: string;
  type?: string;
  status?: string;
  summary?: string;
  selected?: boolean;
  onSelect?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
  /** Optional content-status indicators (resumo/transcrição/insights) rendered below the summary line. */
  badges?: React.ReactNode;
}

/** Conversation list card — layout and states verbatim from ConversationCard. */
export function ConversationCard({
  title,
  date,
  duration,
  type = "outro",
  status = "pendente",
  summary,
  selected = false,
  onSelect,
  style,
  className = "",
  badges,
}: ConversationCardProps) {
  const d =
    date instanceof Date
      ? date
      : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date + "T12:00:00" : String(date));
  return (
    <div
      onClick={onSelect}
      className={["ds-card ds-card--clickable", selected ? "ds-card--selected" : "", className].filter(Boolean).join(" ")}
      style={style}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h3 style={{ font: "400 16px/24px var(--fontFamily)", marginBottom: 4, minWidth: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <TypeBadge type={type} />
          <StatusBadge status={status} />
        </div>
      </div>
      <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--color-text-secondary)" }}>
        <span style={{ font: "500 12px/20px var(--font-sans)" }}>
          {d.toLocaleDateString("pt-BR")}
          {duration ? " · " + duration : ""}
        </span>
        {summary ? <span>{" · "}{summary}</span> : null}
      </p>
      {badges ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{badges}</div> : null}
    </div>
  );
}
