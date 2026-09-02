"use client";

import { useSyncExternalStore } from "react";

// Até 900px a navegação compacta evita comprimir os filtros e o conteúdo útil
// entre uma sidebar fixa e a borda da tela (especialmente em tablets verticais).
const QUERY = "(max-width: 900px)";

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// SSR renderiza desktop; o cliente corrige no primeiro paint.
const getServerSnapshot = () => false;

export const useIsMobile = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
