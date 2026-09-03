"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationIcon, type NavigationIconName } from "@/components/layout/navigation-icon";

type TabDef = { icon: NavigationIconName; label: string; path: string };

const TABS: TabDef[] = [
  { icon: "dashboard", label: "Dashboard", path: "/" },
  { icon: "conversations", label: "Conversas", path: "/conversas" },
  { icon: "opportunities", label: "Negócios", path: "/novos-negocios" },
  { icon: "clone", label: "Clone", path: "/clone" },
];

const MORE_ITEMS: TabDef[] = [
  { icon: "contents", label: "Conteúdos", path: "/conteudos" },
  { icon: "projects", label: "Projetos", path: "/projetos" },
  { icon: "topics", label: "Assuntos de Interesse", path: "/assuntos-interesse" },
  { icon: "settings", label: "Configurações", path: "/configuracoes" },
  { icon: "clone", label: "Perfil", path: "/perfil" },
];

const MobileTabBar = () => {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreSheetRef = useRef<HTMLElement>(null);
  const moreTriggerRef = useRef<HTMLElement | null>(null);
  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const moreActive = MORE_ITEMS.some((item) => isActive(item.path));

  useEffect(() => {
    const open = () => {
      moreTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMoreOpen(true);
    };
    window.addEventListener("pgm:open-more", open);
    return () => window.removeEventListener("pgm:open-more", open);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;

    const sheet = moreSheetRef.current;
    const focusable = Array.from(sheet?.querySelectorAll<HTMLElement>("a, button") ?? []);
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        requestAnimationFrame(() => moreTriggerRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  return (
    <>
      {moreOpen ? (
        <>
          <button
            type="button"
            className="pgm-mobile-backdrop"
            aria-label="Fechar menu"
            onClick={() => {
              setMoreOpen(false);
              requestAnimationFrame(() => moreTriggerRef.current?.focus());
            }}
          />
          <section ref={moreSheetRef} className="pgm-more-sheet" role="dialog" aria-modal="true" aria-label="Menu completo">
            <h2 className="pgm-more-sheet__title">Mais áreas</h2>
            {MORE_ITEMS.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className="pgm-more-sheet__item"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                >
                  <NavigationIcon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        </>
      ) : null}

      <nav className="pgm-mobile-tabs" aria-label="Navegação principal">
        {TABS.map((tab) => {
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className="pgm-mobile-tabs__item"
              data-active={active}
              aria-current={active ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
            >
              <NavigationIcon name={tab.icon} size={22} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className="pgm-mobile-tabs__item"
          data-active={moreOpen || moreActive}
          aria-expanded={moreOpen}
          onClick={() => {
            if (moreOpen) {
              setMoreOpen(false);
              requestAnimationFrame(() => moreButtonRef.current?.focus());
              return;
            }
            moreTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : moreButtonRef.current;
            setMoreOpen(true);
          }}
        >
          <NavigationIcon name="more" size={22} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
};

export default MobileTabBar;
