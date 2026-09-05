"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search, User, X } from "lucide-react";
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
  ["/perfil", "Conta"],
];

const CONTEXTS: [string, string][] = [
  ["/conversas", "Biblioteca de evidências"],
  ["/novos-negocios", "Observatório de oportunidades"],
  ["/conteudos", "Estúdio editorial"],
  ["/projetos", "Portfólio de execução"],
  ["/assuntos-interesse", "Mesa de temas acompanhados"],
  ["/clone", "Assistente fundamentado"],
  ["/configuracoes", "Sistema e integrações"],
  ["/perfil", "Perfil"],
];

const titleFor = (pathname: string) => {
  if (pathname === "/") return "Dashboard";
  return TITLES.find(([path]) => pathname.startsWith(path))?.[1] ?? "Plaud Gold Miner";
};

const contextFor = (pathname: string) => {
  if (pathname === "/") return "Visão executiva";
  return CONTEXTS.find(([path]) => pathname.startsWith(path))?.[1] ?? "Inteligência aplicada";
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "?";

const nameFromEmail = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1).toLocaleLowerCase("pt-BR"))
    .join(" ");

const Toolbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const searchRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);
  const avatarButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!avatarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) setAvatarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAvatarOpen(false);
        avatarButtonRef.current?.focus();
        return;
      }

      const items = Array.from(accountMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex: number | null = null;
      if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = items.length - 1;
      if (nextIndex != null && items[nextIndex]) {
        event.preventDefault();
        items[nextIndex].focus();
      } else if (event.key === "Tab") {
        setAvatarOpen(false);
      }
    };
    const focusFrame = window.requestAnimationFrame(() => {
      accountMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [avatarOpen]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof metadata.full_name === "string" && metadata.full_name) ||
        (typeof metadata.name === "string" && metadata.name) ||
        nameFromEmail(email) ||
        "";
      setUserEmail(email);
      setUserName(name);
    });
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const completeSearch = () => { setSearchOpen(false); setMobileSearchOpen(false); };

  const signOut = async () => {
    setSignOutError("");
    try {
      const response = await fetch("/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Falha ao sair");
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Não foi possível sair. Tente novamente pelo menu da conta.");
    }
  };

  const openMobileMenu = () => window.dispatchEvent(new CustomEvent("pgm:open-more"));

  return (
    <header className="pgm-toolbar">
      {isMobile ? (
        <button type="button" className="icon-btn" aria-label="Abrir menu completo" onClick={openMobileMenu}>
          <Menu size={20} strokeWidth={1.75} />
        </button>
      ) : null}
      <nav className="pgm-toolbar__breadcrumb" aria-label="Você está em">
        {isMobile ? null : (
          <>
            <Link href={TITLES.find(([path]) => pathname.startsWith(path))?.[0] ?? "/"}>{titleFor(pathname)}</Link>
            <span aria-hidden>›</span>
          </>
        )}
        <span>{contextFor(pathname)}</span>
      </nav>
      <span className="pgm-toolbar__spacer" />

      {!isMobile || mobileSearchOpen ? (
        <div ref={searchRef} className="pgm-toolbar__search" role="search" style={{ overflow: "visible" }} onKeyDown={(event) => {
          if (event.key === "Escape") { setSearchOpen(false); setMobileSearchOpen(false); }
        }}>
          <Search size={18} strokeWidth={1.75} aria-hidden />
          <input
            autoFocus={isMobile}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) { event.preventDefault(); router.push(`/conversas?q=${encodeURIComponent(query.trim())}`); completeSearch(); }
            }}
            placeholder="Buscar conversas, negócios, conteúdos"
            aria-label="Buscar conversas, negócios, conteúdos"
          />
          {searchOpen && query.trim() ? <div className="menu" aria-label="Onde buscar" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, minWidth: 0, zIndex: 60 }}>
            {[["conversas", "Conversas"], ["novos-negocios", "Novos Negócios"], ["conteudos", "Conteúdos"]].map(([route, label]) => (
              <Link key={route} href={`/${route}?q=${encodeURIComponent(query.trim())}`} onClick={completeSearch}>Buscar em {label}</Link>
            ))}
          </div> : null}
          {isMobile ? (
            <button type="button" className="icon-btn" aria-label="Fechar busca" onClick={() => setMobileSearchOpen(false)}>
              <X size={18} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pgm-toolbar__actions">
        {signOutError ? <span role="alert">{signOutError}</span> : null}
        {isMobile ? (
          <button type="button" className="icon-btn" aria-label="Buscar" onClick={() => setMobileSearchOpen(true)}>
            <Search size={20} strokeWidth={1.75} />
          </button>
        ) : null}

        <Link href="/clone" className="pgm-toolbar__ask" aria-label="Perguntar à IA">
          <span>Perguntar à IA</span>
          <span aria-hidden>→</span>
        </Link>

        <div ref={avatarRef} style={{ position: "relative", display: "inline-flex" }}>
          <button
            ref={avatarButtonRef}
            type="button"
            className="pgm-avatar"
            aria-label="Abrir conta"
            aria-expanded={avatarOpen}
            aria-haspopup="menu"
            aria-controls="account-menu"
            onClick={() => setAvatarOpen((open) => !open)}
          >
            {initialsOf(userName)}
          </button>
          {avatarOpen ? (
            <div
              ref={accountMenuRef}
              id="account-menu"
              className="menu"
              role="menu"
              aria-label={`Conta de ${userName || "usuário"}`}
              style={{ position: "absolute", top: 50, right: 0, zIndex: 49 }}
            >
              <div style={{ padding: "10px 12px 8px" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{userName || "—"}</div>
                <div style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--app-muted)", fontSize: 14 }}>
                  {userEmail || "—"}
                </div>
              </div>
              <Link href="/perfil" role="menuitem" tabIndex={-1} onClick={() => setAvatarOpen(false)}>
                <User size={17} strokeWidth={1.75} /> Perfil
              </Link>
              <a
                href="#sair"
                role="menuitem"
                tabIndex={-1}
                style={{ color: "var(--color-danger-600)" }}
                onClick={(event) => {
                  event.preventDefault();
                  setAvatarOpen(false);
                  void signOut();
                }}
              >
                <LogOut size={17} strokeWidth={1.75} /> Sair
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Toolbar;
