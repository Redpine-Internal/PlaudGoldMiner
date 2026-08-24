import React from "react";

const STATUSES = ["processado", "pendente", "erro"];

export interface StatusBadgeProps {
  status?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Processing-status badge — colors from --status-* tokens, rounded-md, font-medium. Renders the raw slug. */
export function StatusBadge({ status = "pendente", style, className = "" }: StatusBadgeProps) {
  const s = STATUSES.includes(status) ? status : "pendente";
  return (
    <span
      className={("ds-badge ds-badge--status " + className).trim()}
      style={{ background: `var(--status-${s}-bg)`, color: `var(--status-${s}-fg)`, ...style }}
    >
      {status}
    </span>
  );
}
