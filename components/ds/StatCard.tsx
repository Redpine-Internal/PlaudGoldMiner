"use client";
import React from "react";
import { Icon } from "./Icon";

export interface StatCardProps {
  title?: string;
  value?: React.ReactNode;
  icon?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

/** Dashboard stat card — from StatCard in app/page (title, big number, top-right icon). */
export function StatCard({ title, value, icon, onClick, style, className = "" }: StatCardProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={("ds-card " + className).trim()}
      style={{
        padding: 24,
        cursor: onClick ? "pointer" : "default",
        background: hover && onClick ? "var(--backgroundContainerHover)" : undefined,
        boxShadow: "none",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h4 style={{ font: "500 14px/20px var(--font-sans)", color: "var(--color-text-secondary)" }}>{title}</h4>
          <p style={{ margin: "8px 0 0", font: "400 32px/40px var(--fontFamily)" }}>{value}</p>
        </div>
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={hover ? "var(--color-primary)" : "var(--color-muted-foreground)"}
            style={{ transition: "color 150ms" }}
          />
        ) : null}
      </div>
    </div>
  );
}
