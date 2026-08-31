"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  Target,
  Sparkles,
  MoreHorizontal,
  FileText,
  ClipboardList,
  BookOpen,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

type TabDef = { icon: LucideIcon; label: string; path: string };

const TABS: TabDef[] = [
  { icon: Home, label: "Início", path: "/" },
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
  const moreActive = MORE_ITEMS.some((i) => isActive(i.path));

  return (
    <>
      {moreOpen ? (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 44,
              background: "rgba(10,16,30,0.3)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              bottom: 96,
              zIndex: 45,
              padding: 8,
              background: "color-mix(in srgb, var(--color-card) 76%, transparent)",
              backdropFilter: "blur(32px) saturate(1.8)",
              WebkitBackdropFilter: "blur(32px) saturate(1.8)",
              border: "1px solid color-mix(in srgb, #ffffff 40%, var(--color-border))",
              borderRadius: 24,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 24px 64px rgba(0,6,20,0.25)",
            }}
          >
            {MORE_ITEMS.map((item) => {
              const IconCmp = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    height: 48,
                    padding: "0 14px",
                    borderRadius: 5,
                    fontSize: 15,
                    fontWeight: 500,
                    textDecoration: "none",
                    color: active ? "var(--color-brand)" : "var(--color-foreground)",
                  }}
                >
                  <IconCmp size={24} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      <nav
        style={{
          position: "fixed",
          left: 10,
          right: 10,
          bottom: 10,
          zIndex: 46,
          height: 74,
          padding: "8px 6px calc(8px + env(safe-area-inset-bottom))",
          boxSizing: "content-box",
          display: "flex",
          alignItems: "stretch",
          background: "var(--modal-material)",
          backdropFilter: "blur(60px)",
          WebkitBackdropFilter: "blur(60px)",
          border: "1px solid color-mix(in srgb, #ffffff 40%, var(--color-border))",
          borderRadius: 9999,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 12px 40px rgba(0,6,20,0.2)",
        }}
      >
        {TABS.map((tab) => {
          const IconCmp = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              onClick={() => setMoreOpen(false)}
              style={{
                flex: 1,
                minWidth: 44,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                textDecoration: "none",
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--color-brand)" : "var(--color-muted-foreground)",
              }}
            >
              <IconCmp size={24} strokeWidth={active ? 2 : 1.75} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          style={{
            flex: 1,
            minWidth: 44,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
            borderRadius: 5,
            font: "inherit",
            fontSize: 10,
            fontWeight: moreOpen || moreActive ? 600 : 400,
            color: moreOpen || moreActive ? "var(--color-brand)" : "var(--color-muted-foreground)",
          }}
        >
          <MoreHorizontal size={24} strokeWidth={1.75} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
};

export default MobileTabBar;
