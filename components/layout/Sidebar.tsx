"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationIcon, type NavigationIconName } from "@/components/layout/navigation-icon";
import { useAppStore } from "@/stores/appStore";

type NavDef = { icon: NavigationIconName; label: string; path: string };

const GROUPS: { label: string; items: NavDef[] }[] = [
  {
    label: "Principal",
    items: [
      { icon: "dashboard", label: "Dashboard", path: "/" },
      { icon: "conversations", label: "Conversas", path: "/conversas" },
      { icon: "opportunities", label: "Novos Negócios", path: "/novos-negocios" },
      { icon: "contents", label: "Conteúdos", path: "/conteudos" },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { icon: "projects", label: "Projetos", path: "/projetos" },
      { icon: "topics", label: "Assuntos de Interesse", path: "/assuntos-interesse" },
      { icon: "clone", label: "Clone", path: "/clone" },
    ],
  },
];

const NavLink = ({ def, active, collapsed }: { def: NavDef; active: boolean; collapsed: boolean }) => {
  return (
    <Link
      href={def.path}
      title={def.label}
      aria-label={collapsed ? def.label : undefined}
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
        <NavigationIcon name={def.icon} />
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
          def={{ icon: "settings", label: "Configurações", path: "/configuracoes" }}
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
          <NavigationIcon name={collapsed ? "expand" : "collapse"} />
          {collapsed ? null : <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
