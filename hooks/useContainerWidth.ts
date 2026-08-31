"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mede a largura real do elemento, não a da janela.
 *
 * O dashboard vive dentro da <main> da AppShell, que divide espaço com a
 * sidebar (~213px) e, em /conversas, com o OutputPanel. Uma media query de
 * viewport erra por essa diferença: numa janela de 900px o conteúdo recebe
 * 660px, e um grid de duas colunas decidido por `innerWidth` se espreme.
 *
 * Retorna 0 até a primeira medição — quem consome trata 0 como "ainda não sei"
 * e cai no layout de uma coluna, que é seguro em qualquer largura.
 */
export const useContainerWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
};
