"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  FileText,
  Home,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Sparkles,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";

type TabDef = { icon: LucideIcon; label: string; path: string };

const TABS: TabDef[] = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: MessageCircle, label: "Conversas", path: "/conversas" },
  { icon: Target, label: "Negócios", path: "/novos-negocios" },
  { icon: Sparkles, label: "Clone", path: "/clone" },
];

const MORE_ITEMS: TabDef[] = [
  { icon: FileText, label: "Conteúdos", path: "/conteudos" },
  { icon: ClipboardList, label: "Projetos", path: "/projetos" },
  { icon: BookOpen, label: "Assuntos de Interesse", path: "/assuntos-interesse" },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
  { icon: User, label: "Perfil", path: "/perfil" },
];

const MobileTabBar = () => {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const moreActive = MORE_ITEMS.some((item) => isActive(item.path));

  useEffect(() => {
    const open = () => setMoreOpen(true);
    window.addEventListener("pgm:open-more", open);
    return () => window.removeEventListener("pgm:open-more", open);
  }, []);

  return (
    <>
      {moreOpen ? (
        <>
          <button type="button" className="pgm-mobile-backdrop" aria-label="Fechar menu" onClick={() => setMoreOpen(false)} />
          <section className="pgm-more-sheet" aria-label="Menu completo">
            <h2 className="pgm-more-sheet__title">Mais áreas</h2>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className="pgm-more-sheet__item"
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        </>
      ) : null}

      <nav className="pgm-mobile-tabs" aria-label="Navegação principal">
        {TABS.map((tab) => {
          const Icon = tab.icon;
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
              <Icon size={22} strokeWidth={1.75} aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="pgm-mobile-tabs__item"
          data-active={moreOpen || moreActive}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
};

export default MobileTabBar;
