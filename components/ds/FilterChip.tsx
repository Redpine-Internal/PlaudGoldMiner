"use client";
import React from "react";

export interface FilterChipProps {
  active?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  count?: number | null;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/** Pill toggle used for filter options and type selection (ConversationFilters, MetadataForm). */
export function FilterChip({ active = false, onClick, count, children, style, className = "" }: FilterChipProps) {
  return (
    <button
      type="button"
      className={["ds-chip", active ? "ds-chip--active" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
      style={style}
    >
      {children}
      {count != null ? <span className="ds-chip-count">{count}</span> : null}
    </button>
  );
}
