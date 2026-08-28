"use client";

import { useCallback, useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   usePersistedFilters — estado de filtros de UI persistido em localStorage
   sob a chave "pgm-filters-" + key. SSR-safe: o servidor (e o primeiro paint
   do cliente) usam `initial`; o valor salvo é mesclado num efeito pós-mount,
   evitando divergência de hidratação. Valores salvos são mesclados sobre o
   `initial` (chaves novas no schema mantêm o default).
   ───────────────────────────────────────────────────────────────────────────── */

const STORAGE_PREFIX = "pgm-filters-";

export const usePersistedFilters = <T extends object>(
  key: string,
  initial: T,
): [T, (patch: Partial<T>) => void] => {
  const storageKey = STORAGE_PREFIX + key;
  const [state, setState] = useState<T>(initial);

  // Hidrata do localStorage só no cliente, após o mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setState((prev) => ({ ...prev, ...(parsed as Partial<T>) }));
      }
    } catch {
      /* storage indisponível ou JSON inválido — mantém o initial */
    }
  }, [storageKey]);

  const setPartial = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            /* storage indisponível — segue só em memória */
          }
        }
        return next;
      });
    },
    [storageKey],
  );

  return [state, setPartial];
};
