import React from "react";
import { Icon } from "./Icon";

export interface PaginationProps {
  /** Página atual (1-based). */
  page: number;
  /** Total de páginas. */
  pageCount: number;
  onChange: (page: number) => void;
  style?: React.CSSProperties;
  className?: string;
}

/** Constrói a lista de páginas a exibir, com "…" quando há muitas. */
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

/** Paginação simples: setas prev/next + números com elipse. Some quando há 1 página. */
export function Pagination({ page, pageCount, onChange, style, className = "" }: PaginationProps) {
  if (pageCount <= 1) return null;

  const btn: React.CSSProperties = {
    minWidth: 32,
    height: 32,
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    background: "var(--color-background)",
    color: "var(--color-foreground)",
    font: "400 14px/20px var(--font-sans)",
    cursor: "pointer",
  };
  const disabled: React.CSSProperties = { opacity: 0.4, cursor: "default" };

  return (
    <nav
      aria-label="Paginação"
      className={className}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24, ...style }}
    >
      <button
        type="button"
        aria-label="Página anterior"
        style={{ ...btn, ...(page <= 1 ? disabled : null) }}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} style={{ minWidth: 32, textAlign: "center", color: "var(--color-muted-foreground)" }}>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            style={{
              ...btn,
              ...(p === page
                ? { background: "var(--color-primary)", color: "var(--color-primary-foreground)", borderColor: "var(--color-primary)" }
                : null),
            }}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        aria-label="Próxima página"
        style={{ ...btn, ...(page >= pageCount ? disabled : null) }}
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
