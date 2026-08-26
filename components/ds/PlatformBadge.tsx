import React from "react";

const PLATFORMS = ["youtube", "linkedin", "artigo", "blog"];

export interface PlatformBadgeProps {
  platform?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Content-platform badge — colors from --platform-* tokens. Renders the raw slug. */
export function PlatformBadge({ platform = "blog", style, className = "" }: PlatformBadgeProps) {
  const p = PLATFORMS.includes(platform) ? platform : "artigo";
  return (
    <span
      className={("ds-badge " + className).trim()}
      style={{ background: `var(--platform-${p}-bg)`, color: `var(--platform-${p}-fg)`, ...style }}
    >
      {platform === "blog" ? "artigo" : platform}
    </span>
  );
}
