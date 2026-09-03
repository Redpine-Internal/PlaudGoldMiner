"use client";
import React from "react";

export interface FilterChipProps {
  active?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  count?: number | null;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}

/** Pill toggle used for filter options and type selection (ConversationFilters, MetadataForm). */
export function FilterChip({
  active = false,
  onClick,
  count,
  children,
  style,
  className = "",
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
}: FilterChipProps) {
  return (
    <button
      type="button"
      className={["ds-chip", active ? "ds-chip--active" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
      style={style}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {children}
      {count != null ? <span className="ds-chip-count">{count}</span> : null}
    </button>
  );
}
