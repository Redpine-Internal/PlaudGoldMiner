"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Search, HelpCircle, Bell, Sun, Moon, User, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";

const TITLES: [string, string][] = [
  ["/conversas", "Conversas"],
  ["/novos-negocios", "Novos Negócios"],
  ["/conteudos", "Conteúdos"],
  ["/projetos", "Projetos"],
  ["/assuntos-interesse", "Assuntos de Interesse"],
  ["/clone", "Clone"],
  ["/configuracoes", "Configurações"],
  ["/perfil", "Perfil"],
];

const titleFor = (pathname: string) => {
  if (pathname === "/") return "";
  const hit = TITLES.find(([p]) => pathname.startsWith(p));
  return hit ? hit[1] : "";
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const Toolbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const [q, setQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dark, setDark] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // O backdrop-filter do header cria um containing block para position:fixed,
  // então um overlay fixo não cobre a página — fechamos por clique-fora.
  useEffect(() => {
    if (!avatarOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [avatarOpen]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        email.split("@")[0] ||
        "";
      setUserEmail(email);
      setUserName(name);
    });
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pgm-theme", next ? "dark" : "light");
    } catch {
      /* storage indisponível */
    }
  };

  // Busca global fase 1: digitar leva a Conversas já filtrando.
  const onSearch = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(value ? `/conversas?q=${encodeURIComponent(value)}` : "/conversas");
    }, 300);
  };

  const handleSignOut = async () => {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const title = titleFor(pathname);

  const iconBtn: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    width: 28,
    borderRadius: 5,
    background: "transparent",
    color: "var(--color-muted-foreground)",
    border: "none",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <header
      className="lg-bar lg-hairline-b"
      style={{
        height: 52,
        flexShrink: 0,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        padding: isMobile ? "0 16px" : "0 24px",
        gap: 16,
        zIndex: 20,
        position: "relative",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 15,
          lineHeight: 1.4,
          fontWeight: 600,
          color: "var(--color-foreground)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h1>
      <div style={{ flex: 1 }} />

      {isMobile ? null : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 28,
            width: 220,
            padding: "0 8px",
            borderRadius: 5,
            background: "var(--color-muted)",
            boxSizing: "border-box",
          }}
        >
          <span style={{ color: "var(--color-muted-foreground)", display: "inline-flex", flexShrink: 0 }}>
            <Search size={14} strokeWidth={1.75} />
          </span>
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar"
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              fontSize: 13,
              fontFamily: "inherit",
              color: "var(--color-foreground)",
              outline: "none",
              padding: 0,
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {isMobile ? null : (
          <button type="button" aria-label="Ajuda" className="icon-btn" style={iconBtn}>
            <HelpCircle size={18} strokeWidth={1.75} />
          </button>
        )}
        <button type="button" aria-label="Notificações" className="icon-btn" style={iconBtn}>
          <Bell size={18} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Tema" className="icon-btn" style={iconBtn} onClick={toggleDark}>
          {dark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
        </button>

        <div ref={avatarRef} style={{ position: "relative", marginLeft: 8, display: "inline-flex" }}>
          <button
            type="button"
            aria-label="Conta"
            onClick={() => setAvatarOpen((v) => !v)}
            style={{
              display: "inline-flex",
              height: 28,
              width: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              background: "var(--color-brand)",
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {initialsOf(userName)}
          </button>
          {avatarOpen ? (
            <div
                className="menu"
                style={{ position: "absolute", top: 36, right: 0, left: "auto", bottom: "auto", zIndex: 49, width: 200 }}
              >
                <div
                  style={{
                    padding: "8px 10px 6px",
                    borderBottom: "1px solid var(--sb-border)",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{userName || "—"}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-muted-foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {userEmail || "—"}
                  </div>
                </div>
                <Link href="/perfil" onClick={() => setAvatarOpen(false)}>
                  <User size={16} strokeWidth={1.75} />
                  Perfil
                </Link>
                <a
                  href="#sair"
                  style={{ color: "var(--color-danger-600)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    setAvatarOpen(false);
                    void handleSignOut();
                  }}
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  Sair
                </a>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Toolbar;
