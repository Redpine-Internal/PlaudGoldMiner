"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, EmptyState, Pagination, SearchInput, Skeleton } from "@/components/ds";
import { GlassList, GlassListRow } from "@/components/lg/GlassList";
import { PROJECT_STATUS_LABELS } from "@/lib/presentation/labels";

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

const statusLabels: Record<Project["status"], string> = PROJECT_STATUS_LABELS;

// Cápsula neutra + texto em cor semântica escurecida (protótipo Liquid Glass).
const statusFg: Record<Project["status"], string> = {
  ativo: "var(--badge-green)",
  pausado: "var(--badge-orange)",
  arquivado: "var(--badge-gray)",
};

const sourceLabels: Record<string, string> = {
  opportunity: "Novo negócio",
  insight: "Insight",
  content: "Conteúdo",
  manual: "Criação manual",
};

export default function ProjetosPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Project["status"]>("ativo");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiResponse>("/api/projects?limit=100", fetcher, { revalidateOnFocus: false });

  const projects = useMemo(() => data?.data ?? [], [data]);
  const counts = useMemo(() => ({
    ativo: projects.filter((project) => project.status === "ativo").length,
    pausado: projects.filter((project) => project.status === "pausado").length,
    arquivado: projects.filter((project) => project.status === "arquivado").length,
  }), [projects]);
  const list = useMemo(
    () => projects.filter((project) => project.status === statusFilter && project.title.toLowerCase().includes(q.toLowerCase())),
    [projects, q, statusFilter],
  );
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => { setPage(1); }, [q, statusFilter]);
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

  const setProjectStatus = async (id: string, status: Project["status"]) => {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await mutate();
  };

  return (
    <div className="pgm-projects-page">
      <ol className="pgm-process-strip" aria-label="Etapas do fluxo de inteligência">
        <li><span>1</span>Capturar conversas</li>
        <li><span>2</span>Revisar evidências</li>
        <li><span>3</span>Avaliar oportunidade</li>
        <li aria-current="step"><span>4</span>Ativar ações</li>
        <li className="pgm-process-strip__help">+ O que você faz aqui</li>
      </ol>

      <header className="pgm-projects-hero">
        <div>
          <p className="pgm-page-eyebrow">Portfólio de execução</p>
          <h1>Projetos</h1>
        </div>
        <div className="pgm-projects-hero__actions">
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} onClick={() => mutate()}>Atualizar</Button>
          <Button variant="primary" icon="add-more" onClick={() => setShowCreate((open) => !open)}>Novo Projeto →</Button>
        </div>
      </header>

      {showCreate ? (
        <form
          onSubmit={(event) => { event.preventDefault(); void createProject(); }}
          className="ds-card"
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: "12px 14px" }}
        >
          <label htmlFor="new-project-title" className="sr-only">Nome do projeto</label>
          <input
            id="new-project-title"
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

      <div className="pgm-projects-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar projetos" />
        <div className="pgm-projects-tabs" role="tablist" aria-label="Status do projeto">
          {(["ativo", "pausado", "arquivado"] as const).map((status) => (
            <button key={status} type="button" role="tab" aria-selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {statusLabels[status]} <span>{counts[status]}</span>
            </button>
          ))}
        </div>
        <span className="pgm-projects-toolbar__count">{list.length} projeto{list.length !== 1 ? "s" : ""}</span>
      </div>

      {error ? <div role="alert" style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 6 }}>Erro ao carregar projetos. Por favor, tente novamente.</div> : null}

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
          <GlassList className="pgm-project-list">
            {paged.map((p) => (
              <GlassListRow
                key={p.id}
                onClick={() => router.push(`/projetos/${p.id}`)}
                hideChevron
                className="pgm-project-row"
                aria-label={p.title}
              >
                <div className="pgm-project-row__main">
                  <strong>{p.title}</strong>
                  {p.description ? <p>{p.description}</p> : null}
                </div>
                <div className="pgm-project-row__meta">
                  <span className="ds-badge pgm-project-row__status" style={{ background: "var(--badge-bg)", color: statusFg[p.status] }}>{statusLabels[p.status]}</span>
                  <span className="pgm-project-row__origin">Origem: {p.sourceType ? sourceLabels[p.sourceType] || p.sourceType : "Não informada"}</span>
                  <span className="pgm-project-row__date">Criado em {new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="pgm-project-row__actions">
                  {p.status !== "arquivado" ? (
                    <button type="button" onClick={(event) => { event.stopPropagation(); void setProjectStatus(p.id, "arquivado"); }}>Arquivar</button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); void setProjectStatus(p.id, p.status === "pausado" ? "ativo" : "pausado"); }}
                  >
                    {p.status === "pausado" ? "Retomar" : "Pausar"}
                  </button>
                </div>
              </GlassListRow>
            ))}
          </GlassList>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : (
        <EmptyState icon="layout-dashboard" title="Nenhum projeto ainda" message="Inicie um projeto a partir de um Novo Negócio ou de um Conteúdo." />
      )}
    </div>
  );
}
