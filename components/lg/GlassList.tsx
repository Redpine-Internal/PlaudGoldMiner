"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   GlassList — contêiner de lista "vidro único" do redesign Liquid Glass.
   Um único .ds-card engloba todas as linhas (nunca um card por item), com
   hairlines 1px entre linhas, hover neutro e chevron › nas linhas clicáveis.
   Fiel ao protótipo: grupos ("Hoje", "Esta Semana") são rotulados por um
   <GlassListSection> ACIMA de um contêiner de vidro separado por grupo.
   ───────────────────────────────────────────────────────────────────────────── */

// React 19 deduplica e eleva este <style> pelo par href+precedence.
const LGL_CSS = `
.lgl-row{background:transparent}
.lgl-list>.lgl-row+.lgl-row,.lgl-list>.lgl-section+.lgl-section,.lgl-list>.lgl-row+.lgl-section{box-shadow:inset 0 1px 0 color-mix(in srgb,var(--color-border) 45%,transparent)}
.lgl-row--clickable{cursor:pointer}
.lgl-row--clickable:hover{background:rgba(120,120,128,0.08)}
.lgl-row--clickable:active{background:rgba(120,120,128,0.12)}
.lgl-row--clickable:focus-visible{outline:2px solid var(--color-ring);outline-offset:-2px}
`;

const LglStyle = () => (
  <style href="pgm-lg-glass-list" precedence="default">
    {LGL_CSS}
  </style>
);

/* ── GlassList ── */

export type GlassListProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const GlassList = ({ children, className, style }: GlassListProps) => (
  <div
    className={`ds-card lgl-list${className ? ` ${className}` : ""}`}
    style={{
      display: "flex",
      flexDirection: "column",
      padding: 0,
      overflow: "hidden",
      ...style,
    }}
  >
    <LglStyle />
    {children}
  </div>
);

/* ── GlassListRow ── */

export type GlassListRowProps = {
  children: ReactNode;
  /** Torna a linha clicável: cursor pointer, hover, foco por teclado e chevron ›. */
  onClick?: () => void;
  /** Oculta o chevron › mesmo quando a linha é clicável. */
  hideChevron?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

export const GlassListRow = ({
  children,
  onClick,
  hideChevron = false,
  className,
  style,
  "aria-label": ariaLabel,
}: GlassListRowProps) => {
  const clickable = typeof onClick === "function";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`lgl-row${clickable ? " lgl-row--clickable" : ""}${className ? ` ${className}` : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        minHeight: 44,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
      {clickable && !hideChevron ? (
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          aria-hidden
          style={{ color: "var(--color-muted-foreground)", flexShrink: 0 }}
        />
      ) : null}
    </div>
  );
};

/* ── GlassListSection ── */

export type GlassListSectionProps = {
  /** Rótulo do grupo, ex.: "Hoje", "Esta Semana". */
  children: ReactNode;
  /**
   * false (padrão, fiel ao protótipo): cabeçalho FORA do vidro, acima de um
   * <GlassList> separado por grupo. true: cabeçalho DENTRO do mesmo vidro,
   * entre linhas (ganha hairline superior automática após uma linha).
   */
  inset?: boolean;
  className?: string;
  style?: CSSProperties;
};

export const GlassListSection = ({ children, inset = false, className, style }: GlassListSectionProps) => (
  <div
    className={`lgl-section${className ? ` ${className}` : ""}`}
    style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--color-muted-foreground)",
      padding: inset ? "14px 16px 6px" : "0 4px 8px",
      ...style,
    }}
  >
    <LglStyle />
    {children}
  </div>
);
