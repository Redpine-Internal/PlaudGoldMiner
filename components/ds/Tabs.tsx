"use client";
import React, { useRef } from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  tabs?: (string | TabItem)[];
  active?: string;
  onChange?: (id: string) => void;
  stretch?: boolean;
  style?: React.CSSProperties;
  className?: string;
  idBase?: string;
  "aria-label"?: string;
}

/** Underline tabs — pattern from OutputPanel (Resumo / Transcrição / Insights). */
export function Tabs({
  tabs = [],
  active,
  onChange,
  stretch = true,
  style,
  className = "",
  idBase = "content",
  "aria-label": ariaLabel = "Seções",
}: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const normalizedTabs = tabs.map((tab): TabItem => typeof tab === "string" ? { id: tab, label: tab } : tab);

  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % normalizedTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + normalizedTabs.length) % normalizedTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = normalizedTabs.length - 1;
    if (nextIndex == null) return;

    event.preventDefault();
    const nextTab = normalizedTabs[nextIndex];
    onChange?.(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={["ds-tabs", stretch ? "ds-tabs--stretch" : "", className].filter(Boolean).join(" ")}
      style={style}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
    >
      {normalizedTabs.map((tab, index) => {
        const selected = active ? active === tab.id : index === 0;
        return (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`${idBase}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={"ds-tab" + (selected ? " ds-tab--active" : "")}
            onClick={() => onChange && onChange(tab.id)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
