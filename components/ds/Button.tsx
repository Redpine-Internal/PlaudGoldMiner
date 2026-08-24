"use client";
import React from "react";
import { Icon } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "link";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: string;
  iconSize?: number;
  iconSpin?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Andreza AI button. Variants and paddings lifted verbatim from the app's Tailwind classes. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconSize,
  iconSpin = false,
  children,
  disabled = false,
  onClick,
  title,
  style,
  className = "",
}: ButtonProps) {
  const cls = [
    "ds-btn",
    "ds-btn--" + variant,
    size === "sm" ? "ds-btn--sm" : "",
    !children && variant !== "link" ? "ds-btn--icononly" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const iSize = iconSize || (size === "sm" ? 14 : 18);
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick} title={title} style={style}>
      {icon ? <Icon name={icon} size={iSize} className={iconSpin ? "ds-spin" : ""} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
