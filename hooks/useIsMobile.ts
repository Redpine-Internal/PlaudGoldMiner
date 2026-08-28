"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 768px)";

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// SSR renderiza desktop; o cliente corrige no primeiro paint.
const getServerSnapshot = () => false;

export const useIsMobile = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
