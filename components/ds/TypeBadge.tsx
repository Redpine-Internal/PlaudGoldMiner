import React from "react";

const TYPE_VARS: Record<string, string> = { reuniao: "reuniao", treinamento: "treinamento", informal: "informal", outro: "outro" };

export interface TypeBadgeProps {
  type?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Conversation-type badge — colors from --type-* tokens. Renders the raw type slug, as the app does. */
export function TypeBadge({ type = "outro", style, className = "" }: TypeBadgeProps) {
  const t = TYPE_VARS[type] ? type : "outro";
  return (
    <span
      className={("ds-badge " + className).trim()}
      style={{ background: `var(--type-${t}-bg)`, color: `var(--type-${t}-fg)`, ...style }}
    >
      {type}
    </span>
  );
}
