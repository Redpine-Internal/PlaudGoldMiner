"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ChevronRight,
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
      aria-current={active ? "page" : undefined}
      className={"nav-item" + (active ? " nav-item--active" : "")}
      style={{
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
          color: active ? "var(--bronze)" : "var(--sb-icon)",
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
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.menuCollapsed);
  const toggle = useAppStore((s) => s.toggleMenu);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));

  return (
    <aside className={`pgm-sidebar${collapsed ? " pgm-sidebar--collapsed" : ""}`}>
      <div className="pgm-sidebar__brand">
        <Link href="/" title="Plaud Gold Miner" className="pgm-sidebar__brand-link">
          {collapsed ? (
            <span className="pgm-sidebar__abbreviation">PGM</span>
          ) : (
            <span className="pgm-sidebar__name">Plaud Gold Miner</span>
          )}
        </Link>
      </div>

      <nav className="pgm-sidebar__nav" style={{ paddingInline: collapsed ? 8 : undefined }}>
        {GROUPS.map((g, gi) => (
          <div key={g.label} className="pgm-sidebar__group" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {collapsed ? (
              gi > 0 ? <div style={{ height: 12 }} /> : null
            ) : (
              <div className="pgm-sidebar__label">
                {g.label}
              </div>
            )}
            {g.items.map((def) => (
              <NavLink key={def.path} def={def} active={isActive(def.path)} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="pgm-sidebar__footer" style={{ paddingInline: collapsed ? 8 : undefined }}>
        <NavLink
          def={{ icon: Settings, label: "Configurações", path: "/configuracoes" }}
          active={isActive("/configuracoes")}
          collapsed={collapsed}
        />
        <button
          type="button"
          className="collapse-btn pgm-sidebar__collapse"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          onClick={toggle}
        >
          {collapsed ? <ChevronRight size={18} strokeWidth={1.75} /> : <ChevronLeft size={18} strokeWidth={1.75} />}
          {collapsed ? null : <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
