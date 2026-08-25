"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, ConversationCardSkeleton, EmptyState, Pagination, SearchInput } from "@/components/ds";

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
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Projetos</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="primary" icon="add-more" onClick={() => setShowCreate((open) => !open)}>Novo Projeto</Button>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        </div>
      </div>

      {showCreate ? (
        <form
          onSubmit={(event) => { event.preventDefault(); void createProject(); }}
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: 12, background: "var(--color-sidebar)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}
        >
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nome do projeto"
            style={{ flex: 1, minWidth: 0, padding: "9px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", background: "var(--color-background)", color: "var(--color-foreground)", font: "400 14px/20px var(--font-sans)" }}
          />
          <Button variant="primary" onClick={() => void createProject()} disabled={!title.trim() || creating}>{creating ? "Criando..." : "Criar"}</Button>
        </form>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar projetos..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
        <span style={{ marginLeft: "auto", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{list.length} projeto{list.length !== 1 ? "s" : ""}</span>
      </div>

      {error ? <div role="alert" style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>Erro ao carregar projetos. Por favor, tente novamente.</div> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <ConversationCardSkeleton key={i} />)
        ) : list.length ? (
          <>
            {paged.map((p) => (
              <div
                key={p.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/projetos/${p.id}`)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/projetos/${p.id}`); }}
                style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-sidebar)", cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: "500 15px/22px var(--font-sans)", color: "var(--color-foreground)" }}>{p.title}</div>
                  {p.description ? <div style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{p.description}</div> : null}
                </div>
                <span style={{ padding: "4px 8px", borderRadius: "var(--radius)", background: "var(--color-background)", color: "var(--color-muted-foreground)", font: "400 12px/16px var(--font-sans)" }}>{statusLabels[p.status]}</span>
                <span style={{ whiteSpace: "nowrap", font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
                {p.status !== "arquivado" ? <Button variant="link" icon="trash-can" onClick={(event) => { event.stopPropagation(); void archive(p.id); }}>Arquivar</Button> : null}
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        ) : (
          <EmptyState icon="layout-dashboard" title="Nenhum projeto ainda" message="Inicie um projeto a partir de uma Oportunidade, Insight ou Conteúdo." />
        )}
      </div>
    </div>
  );
}
