"use client";
import React, { useState, useEffect } from "react";

const _cache: Record<string, string> = {};

// Legacy (lucide-era) name -> Mística icon file stem, served from /icons/<stem>-regular.svg
const MAP: Record<string, string> = {
  x: "close",
  plus: "add-more",
  "hard-drive": "cloud-upload",
  "refresh-cw": "reload",
  "loader-circle": "reload",
  "loader-2": "reload",
  "square-pen": "edit-pencil",
  edit: "edit-pencil",
  "trash-2": "trash-can",
  "thumbs-up": "thumb-up",
  youtube: "play-circle",
  linkedin: "chat",
  // Formatos de conteúdo (taxonomia de 2026-08-28). O set Mística não tem
  // ícone de slides nem de claquete, então reaproveitamos os mais próximos.
  clapperboard: "play-circle",
  layers: "documents",
  "book-open": "documents",
  clock: "alarm-clock",
  user: "user-account",
  sparkles: "ai",
  "ai-chat": "ai",
  "file-text": "document-other",
  "message-square": "chat",
  "layout-dashboard": "apps",
  "file-json": "document-other",
  target: "checked",
  funnel: "controls",
  filter: "controls",
  "arrow-left": "chevron-left",
  "arrow-right": "chevron-right",
};

function load(name: string): Promise<string> {
  const stem = MAP[name] || name;
  if (_cache[stem]) return Promise.resolve(_cache[stem]);
  return fetch(`/icons/${stem}-regular.svg`)
    .then((r) => (r.ok ? r.text() : ""))
    .then((t) => {
      if (t) {
        t = t.replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"');
        _cache[stem] = t;
      }
      return t || "";
    })
    .catch(() => "");
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Mística icon (kenos set, "regular" style) served from /icons/; accepts Mística stems ("reload") and legacy lucide names ("refresh-cw"). */
export function Icon({ name, size = 24, color, className = "", style }: IconProps) {
  const stem = MAP[name] || name;
  const [svg, setSvg] = useState<string>(_cache[stem] || "");
  useEffect(() => {
    let alive = true;
    load(name).then((t) => {
      if (alive) setSvg(t);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return (
    <span
      className={("ds-icon " + className).trim()}
      style={{ width: size, height: size, color, ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
