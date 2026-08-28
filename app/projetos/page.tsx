"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Trash2 } from "lucide-react";
import { Button, EmptyState, Pagination, SearchInput, Skeleton } from "@/components/ds";
import { GlassList, GlassListRow } from "@/components/lg/GlassList";

const PAGE_SIZE = 20;

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: "ativo" | "pausado" | "arquivado";
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: Project[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const statusLabels: Record<Project["status"], string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  arquivado: "Arquivado",
};

// Cápsula neutra + texto em cor semântica escurecida (protótipo Liquid Glass).
const statusFg: Record<Project["status"], string> = {
  ativo: "var(--badge-green)",
  pausado: "var(--badge-orange)",
  arquivado: "var(--badge-gray)",
};

// React 19 deduplica e eleva este <style> pelo par href+precedence.
const PROJ_CSS = `
.proj-archive{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--color-muted-foreground);cursor:pointer;flex-shrink:0}
.proj-archive:hover{color:var(--badge-red);background:var(--color-accent)}
.proj-archive:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
`;

export default function ProjetosPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiResponse>("/api/projects?limit=100", fetcher, { revalidateOnFocus: false });

  const projects = data?.data || [];
  const list = useMemo(() => projects.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())), [projects, q]);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const createProject = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      if (!res.ok) return;
      const created: { data: Project } = await res.json();
      await mutate();
      router.push(`/projetos/${created.data.id}`);
    } finally {
      setCreating(false);
    }
  };

  const archive = async (id: string) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "arquivado" }),
    });
    await mutate();
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <style href="pgm-projetos" precedence="default">
        {PROJ_CSS}
      </style>

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 700, letterSpacing: "-0.022em", color: "var(--color-foreground)" }}>Projetos</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="primary" icon="add-more" onClick={() => setShowCreate((open) => !open)}>Novo Projeto</Button>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        </div>
      </div>

      {showCreate ? (
        <form
          onSubmit={(event) => { event.preventDefault(); void createProject(); }}
          className="ds-card"
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: "12px 14px" }}
        >
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nome do projeto"
            className="ds-input"
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button variant="primary" onClick={() => void createProject()} disabled={!title.trim() || creating}>{creating ? "Criando..." : "Criar"}</Button>
        </form>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar projetos..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-muted-foreground)" }}>{list.length} projeto{list.length !== 1 ? "s" : ""}</span>
      </div>

      {error ? <div role="alert" style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 16 }}>Erro ao carregar projetos. Por favor, tente novamente.</div> : null}

      {isLoading ? (
        <GlassList>
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassListRow key={i} style={{ padding: "14px 18px" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton style={{ height: 14, width: "40%" }} />
                <Skeleton style={{ height: 12, width: "24%" }} />
              </div>
            </GlassListRow>
          ))}
        </GlassList>
      ) : list.length ? (
        <>
          <GlassList>
            {paged.map((p) => (
              <GlassListRow
                key={p.id}
                onClick={() => router.push(`/projetos/${p.id}`)}
                aria-label={p.title}
                style={{ padding: "14px 18px" }}
              >
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--color-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                  {p.description ? (
                    <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 1 }}>
                    <span className="ds-badge" style={{ background: "var(--badge-bg)", color: statusFg[p.status] }}>{statusLabels[p.status]}</span>
                    <span style={{ fontSize: 12, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>criado em {new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                {p.status !== "arquivado" ? (
                  <button
                    type="button"
                    className="proj-archive"
                    title="Arquivar projeto"
                    aria-label={`Arquivar ${p.title}`}
                    onClick={(event) => { event.stopPropagation(); void archive(p.id); }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                ) : null}
              </GlassListRow>
            ))}
          </GlassList>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : (
        <EmptyState icon="layout-dashboard" title="Nenhum projeto ainda" message="Inicie um projeto a partir de uma Oportunidade, Insight ou Conteúdo." />
      )}
    </div>
  );
}
