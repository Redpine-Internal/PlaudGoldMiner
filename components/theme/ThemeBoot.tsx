"use client";
import { useEffect } from "react";
import { restoreTheme } from "@/lib/theme";

/** Re-applies persisted theme (accent / aux / bg) on client mount. */
export default function ThemeBoot() {
  useEffect(() => {
    restoreTheme();
  }, []);
  return null;
}
