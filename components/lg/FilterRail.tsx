"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ─────────────────────────────────────────────────────────────────────────────
   FilterRail — filtros do Gabinete Editorial de Inteligência.
   Desktop: aside 220px à esquerda da lista (dentro da área da view), com
   seções declarativas (status / checks / segmented) e "Limpar filtros".
   Mobile (useIsMobile): vira uma linha horizontal rolável de chips .ds-chip.
   O botão de mostrar/ocultar fica na VIEW; aqui só a prop `open` (desktop).
   ───────────────────────────────────────────────────────────────────────────── */

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

export type FilterStatusSection = {
  kind: "status";
  title: string;
  options: FilterOption[];
  /** Valor ativo (seleção exclusiva). */
  value: string;
  onChange: (value: string) => void;
};

export type FilterChecksSection = {
  kind: "checks";
  title: string;
  options: FilterOption[];
  /** Valores marcados (multi-seleção). */
  values: string[];
  /** Recebe o NOVO array completo de valores marcados. */
  onChange: (values: string[]) => void;
};

export type FilterSegmentedSection = {
  kind: "segmented";
  title: string;
  options: FilterOption[];
  /** Valor ativo (seleção exclusiva). */
  value: string;
  onChange: (value: string) => void;
};

export type FilterRailSection = FilterStatusSection | FilterChecksSection | FilterSegmentedSection;

export type FilterRailProps = {
  sections: FilterRailSection[];
  /** Renderiza o botão "Limpar filtros" (desktop) / "Limpar" (mobile) quando presente. */
  onClear?: () => void;
  /** Desktop: mostra/oculta o rail. Ignorado no mobile (chips sempre visíveis). */
  open?: boolean;
  clearLabel?: string;
  className?: string;
  style?: CSSProperties;
};

// React 19 deduplica e eleva este <style> pelo par href+precedence.
const RAIL_CSS = `
.lgr-item{background:transparent}
.lgr-item:hover{background:var(--app-surface-subtle)}
.lgr-item:active{background:var(--app-surface-soft)}
.lgr-item--active,.lgr-item--active:hover{background:var(--app-surface-soft)}
.lgr-item:focus-visible{outline:2px solid var(--color-ring);outline-offset:-2px}
.lgr-clear{min-height:44px}
.lgr-clear:hover{text-decoration:underline}
`;

const RailStyle = () => (
  <style href="pgm-lg-filter-rail" precedence="default">
    {RAIL_CSS}
  </style>
);

const railTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-muted-foreground)",
  padding: "0 8px 6px",
};

const railItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 44,
  padding: "8px",
  borderRadius: 5,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 15,
  textAlign: "left",
  color: "var(--color-foreground)",
  boxSizing: "border-box",
};

const toggleValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

/* ── Seções do rail (desktop) ── */

const StatusRows = ({ section }: { section: FilterStatusSection }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <div style={railTitleStyle}>{section.title}</div>
    {section.options.map((opt) => {
      const active = section.value === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          className={`lgr-item${active ? " lgr-item--active" : ""}`}
          aria-pressed={active}
          onClick={() => section.onChange(opt.value)}
          style={{ ...railItemStyle, fontWeight: active ? 600 : 400 }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {opt.label}
          </span>
          {opt.count !== undefined ? (
            <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", flexShrink: 0 }}>{opt.count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);

const CheckRows = ({ section }: { section: FilterChecksSection }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <div style={railTitleStyle}>{section.title}</div>
    {section.options.map((opt) => {
      const checked = section.values.includes(opt.value);
      return (
        <button
          key={opt.value}
          type="button"
          className="lgr-item"
          role="checkbox"
          aria-checked={checked}
          onClick={() => section.onChange(toggleValue(section.values, opt.value))}
          style={railItemStyle}
        >
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: 5,
              boxSizing: "border-box",
              border: checked ? "1px solid var(--color-brand)" : "1px solid var(--color-border)",
              background: checked ? "var(--color-brand)" : "transparent",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {checked ? <Check size={10} strokeWidth={3} style={{ color: "#FFFFFF" }} /> : null}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {opt.label}
          </span>
          {opt.count !== undefined ? (
            <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", flexShrink: 0 }}>{opt.count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);

const SegmentedRow = ({ section }: { section: FilterSegmentedSection }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ ...railTitleStyle, paddingBottom: 0 }}>{section.title}</div>
    <div className="ds-tabs ds-tabs--stretch" role="tablist" style={{ width: "100%", boxSizing: "border-box" }}>
      {section.options.map((opt) => {
        const active = section.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ds-tab${active ? " ds-tab--active" : ""}`}
            onClick={() => section.onChange(opt.value)}
            style={{ justifyContent: "center" }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
);

/* ── Variante mobile: chips roláveis ── */

const chipStyle: CSSProperties = { flexShrink: 0, whiteSpace: "nowrap" };

const MobileChips = ({ sections, onClear, clearLabel }: Pick<FilterRailProps, "sections" | "onClear" | "clearLabel">) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
      paddingBottom: 4,
    }}
  >
    {sections.map((section) =>
      section.options.map((opt) => {
        const active =
          section.kind === "checks" ? section.values.includes(opt.value) : section.value === opt.value;
        const onClick = () => {
          if (section.kind === "checks") section.onChange(toggleValue(section.values, opt.value));
          else section.onChange(opt.value);
        };
        const label =
          section.kind === "status" && opt.count !== undefined ? `${opt.label} · ${opt.count}` : opt.label;
        return (
          <button
            key={`${section.title}-${opt.value}`}
            type="button"
            className={`ds-chip${active ? " ds-chip--active" : ""}`}
            aria-pressed={active}
            onClick={onClick}
            style={chipStyle}
          >
            {label}
          </button>
        );
      }),
    )}
    {onClear ? (
      <button
        type="button"
        className="lgr-clear"
        onClick={onClear}
        style={{
          ...chipStyle,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--color-brand)",
          padding: "0 8px",
        }}
      >
        {clearLabel ?? "Limpar"}
      </button>
    ) : null}
  </div>
);

/* ── FilterRail ── */

export const FilterRail = ({
  sections,
  onClear,
  open = true,
  clearLabel,
  className,
  style,
}: FilterRailProps) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <RailStyle />
        <MobileChips sections={sections} onClear={onClear} clearLabel={clearLabel} />
      </>
    );
  }

  if (!open) return null;

  return (
    <aside
      className={className}
      style={{
        width: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "sticky",
        top: 0,
        ...style,
      }}
    >
      <RailStyle />
      {sections.map((section) => {
        if (section.kind === "status") return <StatusRows key={section.title} section={section} />;
        if (section.kind === "checks") return <CheckRows key={section.title} section={section} />;
        return <SegmentedRow key={section.title} section={section} />;
      })}
      {onClear ? (
        <button
          type="button"
          className="lgr-clear"
          onClick={onClear}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--color-brand)",
            padding: "0 8px",
          }}
        >
          {clearLabel ?? "Limpar filtros"}
        </button>
      ) : null}
    </aside>
  );
};
