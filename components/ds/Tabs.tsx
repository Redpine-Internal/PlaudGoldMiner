"use client";
import React from "react";

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
}

/** Underline tabs — pattern from OutputPanel (Resumo / Transcrição / Insights). */
export function Tabs({ tabs = [], active, onChange, stretch = true, style, className = "" }: TabsProps) {
  return (
    <div className={["ds-tabs", stretch ? "ds-tabs--stretch" : "", className].filter(Boolean).join(" ")} style={style}>
      {tabs.map((t) => {
        const tab: TabItem = typeof t === "string" ? { id: t, label: t } : t;
        return (
          <button
            key={tab.id}
            type="button"
            className={"ds-tab" + (active === tab.id ? " ds-tab--active" : "")}
            onClick={() => onChange && onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
