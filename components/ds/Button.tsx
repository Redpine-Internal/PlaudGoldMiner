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
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: string;
  iconSize?: number;
  iconSpin?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  "aria-label"?: string;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** Andreza AI button. Variants and paddings lifted verbatim from the app's Tailwind classes. */
export function Button({
  type = "button",
  variant = "primary",
  size = "md",
  icon,
  iconSize,
  iconSpin = false,
  children,
  disabled = false,
  onClick,
  "aria-label": ariaLabel,
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
    <button type={type} className={cls} disabled={disabled} onClick={onClick} aria-label={ariaLabel} title={title} style={style}>
      {icon ? <Icon name={icon} size={iSize} className={iconSpin ? "ds-spin" : ""} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
