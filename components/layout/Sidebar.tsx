"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Icon, SearchInput } from "@/components/ds";
import { useAppStore } from "@/stores/appStore";

const ITEMS = [
  { icon: "apps", label: "Dashboard", path: "/" },
  { icon: "chat", label: "Conversas", path: "/conversas" },
  { icon: "lightbulb", label: "Oportunidades", path: "/oportunidades" },
  { icon: "sparkles", label: "IA Insights", path: "/insights" },
  { icon: "document-other", label: "Conteúdos", path: "/conteudos" },
  { icon: "layout-dashboard", label: "Projetos", path: "/projetos" },
  { icon: "brain", label: "Clone", path: "/clone" },
  { icon: "settings", label: "Configurações", path: "/configuracoes" },
];

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.menuCollapsed);
  const toggle = useAppStore((s) => s.toggleMenu);
  const chats = useAppStore((s) => s.chats);
  const activeChatId = useAppStore((s) => s.activeChatId);
  const selectChat = useAppStore((s) => s.selectChat);
  const newChat = useAppStore((s) => s.newChat);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const inClone = pathname.startsWith("/clone");

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
        background: "var(--backgroundContainer)",
        margin: "10px",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        transition: "width 100ms ease-in-out",
        overflow: "visible",
        position: "relative",
      }}
    >
      <div
        style={{
          padding: collapsed ? "12px 0" : "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          gap: 8,
        }}
      >
        {collapsed ? null : (
          <Link href="/" className="brandmark" title="Andreza AI">
            <Icon name="brain" size={20} color="var(--brand)" />
            <span style={{ font: "400 15px/20px var(--fontFamily)" }}>Andreza AI</span>
          </Link>
        )}
        <button type="button" className="collapse-btn" title={collapsed ? "Expandir menu" : "Recolher menu"} onClick={toggle}>
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={12} />
        </button>
      </div>

      {collapsed ? null : (
        <div style={{ padding: "0 16px 12px" }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar... (⌘K)" />
        </div>
      )}

      <nav style={{ flex: 1, padding: collapsed ? "4px 12px" : "0 16px", overflowY: "auto" }}>
        {inClone && !collapsed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Link href="/" className="nav-item">
              <Icon name="chevron-left" size={16} color="var(--textSecondary)" />
              <span>Menu</span>
            </Link>
            <button
              type="button"
              className="nav-item"
              style={{ border: "none", background: "transparent", width: "100%", cursor: "pointer", font: "inherit", textAlign: "left" }}
              onClick={handleNewChat}
            >
              <Icon name="add-more" size={18} color="var(--brand)" />
              <span style={{ color: "var(--textPrimary)" }}>Novo chat</span>
            </button>
            <div
              style={{
                font: "500 11px/16px var(--fontFamily)",
                color: "var(--textSecondary)",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                padding: "10px 12px 4px",
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
                }}
                onClick={() => handleSelectChat(c.id)}
                title={c.title}
              >
                <Icon name="chat" size={16} color={c.id === activeChatId ? "var(--brand)" : "var(--textSecondary)"} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{c.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {ITEMS.map((it) => {
              const active = isActive(it.path);
              return (
                <li key={it.path}>
                  <Link
                    href={it.path}
                    title={it.label}
                    className={"nav-item" + (active ? " nav-item--active" : "")}
                    style={collapsed ? { justifyContent: "center", padding: 8 } : undefined}
                  >
                    <Icon name={it.icon} size={20} color={active ? "var(--brand)" : "var(--textSecondary)"} />
                    {collapsed ? null : <span>{it.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div
        style={{
          padding: collapsed ? "12px 0" : "12px 16px",
          borderTop: "1px solid var(--divider)",
          display: "flex",
          justifyContent: collapsed ? "center" : "flex-start",
          position: "relative",
        }}
      >
        <button
          type="button"
          className="avatar-btn"
          style={{ margin: 0, width: collapsed ? "auto" : "100%", justifyContent: "flex-start" }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <span className="avatar">A</span>
          {collapsed ? null : (
            <span style={{ textAlign: "left", minWidth: 0 }}>
              <span style={{ display: "block", font: "500 14px/20px var(--fontFamily)", color: "var(--textPrimary)" }}>Andreza</span>
              <span
                style={{
                  display: "block",
                  font: "400 12px/16px var(--fontFamily)",
                  color: "var(--textSecondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                andreza@example.com
              </span>
            </span>
          )}
        </button>
        {open ? (
          <div className="menu" style={{ top: "auto", bottom: 64, left: collapsed ? 56 : 16, right: "auto" }} onClick={(e) => e.stopPropagation()}>
            <Link href="/perfil" onClick={() => setOpen(false)}>
              <Icon name="user-account" size={20} />
              Perfil
            </Link>
            <Link href="/configuracoes" onClick={() => setOpen(false)}>
              <Icon name="settings" size={20} />
              Configurações
            </Link>
            <div className="mdiv"></div>
            <a href="#sair" onClick={(e) => e.preventDefault()}>
              <Icon name="logout" size={20} />
              Sair
            </a>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default Sidebar;
