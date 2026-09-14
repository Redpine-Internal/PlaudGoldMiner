import React from "react";
import { formatConversationType } from "@/lib/presentation/labels";

const TYPE_VARS: Record<string, string> = {
  nao_classificado: "outro",
  reuniao_comercial: "reuniao",
  diagnostico: "reuniao",
  projeto_cliente: "reuniao",
  mentoria: "reuniao",
  reuniao_interna: "reuniao",
  treinamento: "treinamento",
  outro: "outro",
  reuniao: "reuniao",
  informal: "informal",
};

export interface TypeBadgeProps {
  type?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Conversation-type badge — colors from --type-* tokens. */
export function TypeBadge({ type = "outro", style, className = "" }: TypeBadgeProps) {
  const t = TYPE_VARS[type] ?? "outro";
  return (
    <span
      className={("ds-badge " + className).trim()}
      style={{ background: `var(--type-${t}-bg)`, color: `var(--type-${t}-fg)`, ...style }}
    >
      {formatConversationType(type)}
    </span>
  );
}
