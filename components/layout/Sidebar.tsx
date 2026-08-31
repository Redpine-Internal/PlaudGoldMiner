"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  Target,
  FileText,
  ClipboardList,
  BookOpen,
  Sparkles,
  Settings,
  ChevronLeft,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";

type NavDef = { icon: LucideIcon; label: string; path: string };

const GROUPS: { label: string; items: NavDef[] }[] = [
  {
    label: "Principal",
    items: [
      { icon: Home, label: "Dashboard", path: "/" },
      { icon: MessageCircle, label: "Conversas", path: "/conversas" },
      { icon: Target, label: "Novos Negócios", path: "/novos-negocios" },
      { icon: FileText, label: "Conteúdos", path: "/conteudos" },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { icon: ClipboardList, label: "Projetos", path: "/projetos" },
      { icon: BookOpen, label: "Assuntos de Interesse", path: "/assuntos-interesse" },
      { icon: Sparkles, label: "Clone", path: "/clone" },
    ],
  },
];

const NavLink = ({ def, active, collapsed }: { def: NavDef; active: boolean; collapsed: boolean }) => {
  const IconCmp = def.icon;
  return (
    <Link
      href={def.path}
      title={def.label}
      className={"nav-item" + (active ? " nav-item--active" : "")}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        boxShadow: active ? "0 1px 3px rgba(0,6,20,0.25)" : "none",
        justifyContent: collapsed ? "center" : undefined,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: active ? "var(--sb-active-fg)" : "var(--sb-icon)",
        }}
      >
        <IconCmp size={18} strokeWidth={1.75} />
      </span>
      {collapsed ? null : (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def.label}</span>
      )}
    </Link>
  );
};

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.menuCollapsed);
  const toggle = useAppStore((s) => s.toggleMenu);
  const chats = useAppStore((s) => s.chats);
  const activeChatId = useAppStore((s) => s.activeChatId);
  const selectChat = useAppStore((s) => s.selectChat);
  const newChat = useAppStore((s) => s.newChat);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const cloneNav = pathname.startsWith("/clone") && !collapsed;

  const handleNewChat = () => {
    newChat();
    router.push("/clone");
  };
  const handleSelectChat = (id: number) => {
    selectChat(id);
    router.push("/clone");
  };

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--sb-bg)",
        backdropFilter: "blur(28px) saturate(1.6)",
        borderRight: "1px solid var(--sb-border)",
        transition: "width 300ms ease-in-out",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          borderBottom: "1px solid var(--sb-border)",
          padding: collapsed ? "0 12px" : "0 16px",
          boxSizing: "border-box",
          gap: 14,
        }}
      >
        {collapsed ? null : (
          <>
            <Link
              href="/"
              title="Plaud Gold Miner"
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--sb-title)",
                flexShrink: 0,
                textDecoration: "none",
              }}
            >
              PGM
            </Link>
            <span style={{ height: 34, width: 1, background: "var(--sb-border)", flexShrink: 0 }} />
            <span style={{ color: "var(--sb-fg-dim)", fontSize: 12, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
              Plaud Gold Miner
            </span>
          </>
        )}
        <button
          type="button"
          className="collapse-btn"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          onClick={toggle}
          style={{ marginLeft: "auto", marginRight: collapsed ? "auto" : 0 }}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {cloneNav ? (
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", padding: 8 }}>
          <Link href="/" className="nav-item" style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <ChevronLeft size={16} strokeWidth={1.75} />
            <span>Menu</span>
          </Link>
          <button
            type="button"
            className="nav-item"
            style={{
              border: "none",
              background: "transparent",
              width: "100%",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
            }}
            onClick={handleNewChat}
          >
            <span style={{ color: "var(--sb-icon)", display: "inline-flex" }}>
              <Plus size={18} strokeWidth={1.75} />
            </span>
            <span style={{ fontWeight: 500 }}>Novo chat</span>
          </button>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sb-fg-dim)",
              padding: "12px 12px 4px",
            }}
          >
            Histórico
          </div>
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"nav-item" + (c.id === activeChatId ? " nav-item--active" : "")}
              style={{
                border: "none",
                background: c.id === activeChatId ? undefined : "transparent",
                width: "100%",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
              }}
              onClick={() => handleSelectChat(c.id)}
              title={c.title}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {c.title}
              </span>
            </button>
          ))}
        </nav>
      ) : (
        <nav
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflowY: "auto",
            padding: collapsed ? "10px 8px 8px" : "10px 14px 8px",
          }}
        >
          {GROUPS.map((g, gi) => (
            <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {collapsed ? (
                gi > 0 ? (
                  <div style={{ height: 1, background: "var(--sb-border)", margin: "8px 4px" }} />
                ) : null
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--sb-fg-dim)",
                    padding: `${gi === 0 ? 2 : 14}px 10px 4px`,
                  }}
                >
                  {g.label}
                </div>
              )}
              {g.items.map((def) => (
                <NavLink key={def.path} def={def} active={isActive(def.path)} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: collapsed ? "12px 8px" : "12px 10px",
          gap: 4,
          borderTop: "1px solid var(--sb-border)",
        }}
      >
        <NavLink
          def={{ icon: Settings, label: "Configurações", path: "/configuracoes" }}
          active={isActive("/configuracoes")}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
};

export default Sidebar;
