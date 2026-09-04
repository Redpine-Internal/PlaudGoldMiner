import React from "react";
import { formatConversationStatus } from "@/lib/presentation/labels";

const STATUSES = ["processado", "pendente", "processando", "erro"];

export interface StatusBadgeProps {
  status?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Processing-status badge — colors from --status-* tokens, rounded-md, font-medium. */
export function StatusBadge({ status = "pendente", style, className = "" }: StatusBadgeProps) {
  const s = STATUSES.includes(status) ? (status === "processando" ? "pendente" : status) : "pendente";
  return (
    <span
      className={("ds-badge ds-badge--status " + className).trim()}
      style={{ background: `var(--status-${s}-bg)`, color: `var(--status-${s}-fg)`, ...style }}
    >
      {formatConversationStatus(status)}
    </span>
  );
}
