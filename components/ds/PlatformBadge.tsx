import React from "react";
import { formatContentFormat } from "@/lib/presentation/labels";

// Formatos de conteúdo (taxonomia 2026-08-28). Os slugs legados youtube/linkedin/blog
// seguem mapeados porque podem sobrar em linhas antigas.
const LABELS: Record<string, string> = {
  artigo: "artigo",
  post: "post",
  carrossel: "carrossel",
  roteiro: "roteiro",
  blog: "artigo",
  linkedin: "post",
  youtube: "roteiro",
};

export interface PlatformBadgeProps {
  /** Formato do conteúdo: artigo | post | carrossel | roteiro. */
  platform?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Content-format badge — colors from --platform-* tokens. */
export function PlatformBadge({ platform = "artigo", style, className = "" }: PlatformBadgeProps) {
  const p = LABELS[platform] || "artigo";
  return (
    <span
      className={("ds-badge " + className).trim()}
      style={{ background: `var(--platform-${p}-bg)`, color: `var(--platform-${p}-fg)`, ...style }}
    >
      {formatContentFormat(platform)}
    </span>
  );
}
