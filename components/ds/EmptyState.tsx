import React from "react";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon?: string;
  title?: string;
  message?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Generic empty state — dashed border, centered icon + heading + message. */
export function EmptyState({ icon = "file-text", title, message, style, className = "" }: EmptyStateProps) {
  return (
    <div className={("ds-empty " + className).trim()} style={style}>
      <Icon name={icon} size={48} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
