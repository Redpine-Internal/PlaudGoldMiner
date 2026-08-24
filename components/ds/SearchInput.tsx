"use client";
import React from "react";
import { Icon } from "./Icon";

export interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** Search field with leading search icon and clear button — pattern from ConversationFilters. */
export function SearchInput({
  value = "",
  onChange,
  placeholder = "Buscar...",
  disabled = false,
  style,
  className = "",
}: SearchInputProps) {
  return (
    <div className={("ds-search " + className).trim()} style={style}>
      <Icon name="search" size={16} />
      <input
        type="text"
        className="ds-input"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {value ? (
        <button type="button" className="ds-search-clear" onClick={() => onChange && onChange("")}>
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
