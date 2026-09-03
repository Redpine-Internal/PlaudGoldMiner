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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!avatarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) setAvatarOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
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

  const search = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(value ? `/conversas?q=${encodeURIComponent(value)}` : "/conversas");
    }, 300);
  };

  const signOut = async () => {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/login");
    router.refresh();
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
            <Link href={pathname === "/" ? "/" : pathname}>{titleFor(pathname)}</Link>
            <span aria-hidden>›</span>
          </>
        )}
        <span>{contextFor(pathname)}</span>
      </nav>
      <span className="pgm-toolbar__spacer" />

      {!isMobile || mobileSearchOpen ? (
        <div className="pgm-toolbar__search" role="search">
          <Search size={18} strokeWidth={1.75} aria-hidden />
          <input
            autoFocus={isMobile}
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="Buscar conversas, negócios, conteúdos"
            aria-label="Buscar conversas, negócios, conteúdos"
          />
          {isMobile ? (
            <button type="button" className="icon-btn" aria-label="Fechar busca" onClick={() => setMobileSearchOpen(false)}>
              <X size={18} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pgm-toolbar__actions">
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
            type="button"
            className="pgm-avatar"
            aria-label="Abrir conta"
            aria-expanded={avatarOpen}
            onClick={() => setAvatarOpen((open) => !open)}
          >
            {initialsOf(userName)}
          </button>
          {avatarOpen ? (
            <div className="menu" style={{ position: "absolute", top: 50, right: 0, zIndex: 49 }}>
              <div style={{ padding: "10px 12px 8px" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{userName || "—"}</div>
                <div style={{ maxWidth: 196, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--app-muted)", fontSize: 12 }}>
                  {userEmail || "—"}
                </div>
              </div>
              <Link href="/perfil" onClick={() => setAvatarOpen(false)}>
                <User size={17} strokeWidth={1.75} /> Perfil
              </Link>
              <a
                href="#sair"
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
