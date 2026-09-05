"use client";
import React, { useId } from "react";
import { Icon } from "./Icon";

export interface InputProps {
  id?: string;
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
  id,
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
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={className} style={style}>
      {label ? (
        <label htmlFor={inputId} className="ds-label">
          {labelIcon ? <Icon name={labelIcon} size={16} /> : null}
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <input
        id={inputId}
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
