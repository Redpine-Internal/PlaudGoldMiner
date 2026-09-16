import React from "react";
import { formatConversationStatus, formatConversationStatusShort } from "@/lib/presentation/labels";

const STATUSES = ["processado", "pendente", "aguardando_transcricao", "processando", "erro"];

export interface StatusBadgeProps {
  status?: string;
  /**
   * Usa a forma curta do rótulo em contextos de largura fixa (coluna de tabela).
   * O rótulo integral continua acessível em `title` e `aria-label`.
   */
  short?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** Processing-status badge — colors from --status-* tokens, rounded-md, font-medium. */
export function StatusBadge({ status = "pendente", short = false, style, className = "" }: StatusBadgeProps) {
  const normalized = STATUSES.includes(status) ? status : "pendente";
  const s = ["processando", "aguardando_transcricao"].includes(normalized)
    ? "pendente"
    : normalized;
  const full = formatConversationStatus(status);
  const text = short ? formatConversationStatusShort(status) : full;
  const abbreviated = text !== full;
  return (
    <span
      className={("ds-badge ds-badge--status " + className).trim()}
      title={abbreviated ? full : undefined}
      aria-label={abbreviated ? full : undefined}
      style={{ background: `var(--status-${s}-bg)`, color: `var(--status-${s}-fg)`, ...style }}
    >
      {text}
    </span>
  );
}
