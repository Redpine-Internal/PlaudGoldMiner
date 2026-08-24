"use client";
import React from "react";
import { Icon } from "./Icon";

export interface InputProps {
  label?: string;
  labelIcon?: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** Labeled form input — label style (text-sm font-medium, optional inline icon) from MetadataForm. */
export function Input({
  label,
  labelIcon,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  style,
  className = "",
}: InputProps) {
  return (
    <div className={className} style={style}>
      {label ? (
        <label className="ds-label">
          {labelIcon ? <Icon name={labelIcon} size={16} /> : null}
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <input
        type={type}
        className="ds-input"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}
