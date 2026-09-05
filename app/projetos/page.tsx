"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, EmptyState, Pagination, SearchInput, Skeleton } from "@/components/ds";
import { GlassList, GlassListRow } from "@/components/lg/GlassList";
import { PROJECT_STATUS_LABELS } from "@/lib/presentation/labels";
import { fetchJson } from "@/lib/http";

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
  counts: Record<string, number>;
}

const fetcher = fetchJson<ApiResponse>;

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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE), status: statusFilter });
  if (q.trim()) query.set("search", q.trim());
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiResponse>(`/api/projects?${query}`, fetcher, { revalidateOnFocus: false });

  const projects = useMemo(() => data?.data ?? [], [data]);
  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [q, statusFilter]);
  useEffect(() => { if (data && page > pageCount) setPage(pageCount); }, [page, pageCount, data]);

  const createProject = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await fetchJson<{ data: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      await mutate();
      router.push(`/projetos/${created.data.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível criar o projeto.");
    } finally {
      setCreating(false);
    }
  };

  const setProjectStatus = async (id: string, status: Project["status"]) => {
    if (savingId) return;
    setSavingId(id);
    setActionError(null);
    try {
      await fetchJson(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await mutate();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível alterar o status do projeto.");
    } finally {
      setSavingId(null);
    }
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
          <Button type="submit" variant="primary" disabled={!title.trim() || creating}>{creating ? "Criando..." : "Criar"}</Button>
        </form>
      ) : null}

      <div className="pgm-projects-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar projetos" />
        <div className="pgm-projects-tabs" role="tablist" aria-label="Status do projeto">
          {(["ativo", "pausado", "arquivado"] as const).map((status) => (
            <button key={status} type="button" role="tab" aria-selected={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {statusLabels[status]} <span>{counts[status] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="pgm-projects-toolbar__count">{total} projeto{total !== 1 ? "s" : ""}</span>
      </div>

      {error ? <div role="alert" style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 6 }}>Erro ao carregar projetos. Por favor, tente novamente.</div> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}

      {error ? null : isLoading ? (
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
      ) : projects.length ? (
        <>
          <GlassList className="pgm-project-list">
            {projects.map((p) => (
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
                    <button type="button" disabled={Boolean(savingId)} onClick={(event) => { event.stopPropagation(); void setProjectStatus(p.id, "arquivado"); }}>Arquivar</button>
                  ) : null}
                  <button
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={(event) => { event.stopPropagation(); void setProjectStatus(p.id, p.status === "ativo" ? "pausado" : "ativo"); }}
                  >
                    {p.status === "ativo" ? "Pausar" : "Retomar"}
                  </button>
                </div>
              </GlassListRow>
            ))}
          </GlassList>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : (
        <EmptyState icon="layout-dashboard" title="Nenhum projeto encontrado" message={q || statusFilter !== "ativo" ? "Nenhum projeto corresponde à busca e ao status selecionado." : "Inicie um projeto a partir de um Novo Negócio ou de um Conteúdo."} />
      )}
    </div>
  );
}
