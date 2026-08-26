"use client";
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { Button, SearchInput, FilterChip, ContentCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";

const PAGE_SIZE = 20;

interface Content {
  id: string;
  title: string;
  platform: "youtube" | "linkedin" | "artigo" | "blog";
  theme: string;
  outline: string | null;
  mentionCount: number;
  relevanceScore: number;
  status: "sugerido" | "rascunho" | "em_revisao" | "aprovado" | "descartado" | "producao" | "publicado";
  notes: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: Content[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CT_STATUS: Record<string, string> = {
  sugerido: "Sugerido", rascunho: "Rascunho", em_revisao: "Em revisão",
  aprovado: "Aprovado", descartado: "Descartado", producao: "Em produção", publicado: "Publicado",
};
const CT_PLATFORMS: Record<string, string> = { youtube: "YouTube", linkedin: "LinkedIn", artigo: "Artigo" };

const ConteudosPage = () => {
  const enrichment = useEnrichment();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/contents?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const items = data?.data || [];

  const list = useMemo(
    () =>
      items.filter(
        (c) =>
          (!q || c.title.toLowerCase().includes(q.toLowerCase()) || c.theme.toLowerCase().includes(q.toLowerCase())) &&
          (!status.length || status.includes(c.status)) &&
          (!platforms.length || platforms.includes(c.platform)) &&
          (!onlyInteresting || (enrichment?.isInteresting("content", c.id) ?? false))
      ),
    [items, q, status, platforms, onlyInteresting, enrichment]
  );

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => {
    setPage(1);
  }, [q, status, platforms, onlyInteresting]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const setSt = async (id: string, s: string) => {
    try {
      await fetch(`/api/contents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      mutate();
    } catch (err) {
      console.error("Failed to update content status:", err);
    }
  };

  const generateDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/contents/${id}/draft`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao gerar rascunho (HTTP ${res.status}).`);
        return;
      }
      await mutate();
    } catch (err) {
      console.error("Failed to generate content draft:", err);
      setGenError("Não foi possível gerar o rascunho. Verifique a conexão e tente novamente.");
    }
  };

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/contents/analyze", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao gerar conteúdos (HTTP ${res.status}).`);
        return;
      }
      await mutate();
    } catch (err) {
      console.error("Failed to generate contents:", err);
      setGenError("Não foi possível gerar conteúdos. Verifique a conexão e tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    setter((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const hasFilters = q || status.length || platforms.length;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Conteúdos</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={generate} disabled={generating}>
            {generating ? "Gerando..." : "Gerar Conteúdos"}
          </Button>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        </div>
      </div>

      {genError ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--alert-error-bg)",
            color: "var(--alert-error-fg)",
            border: "1px solid var(--alert-error-border)",
            borderRadius: "var(--radius-lg)",
            font: "400 13px/18px var(--font-sans)",
          }}
        >
          {genError}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar conteúdos..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
          <FilterChip active={showFilters || !!hasFilters} onClick={() => setShowFilters(!showFilters)}>
            Filtros
          </FilterChip>
          <FilterChip active={onlyInteresting} onClick={() => setOnlyInteresting((v) => !v)}>
            Só interessantes
          </FilterChip>
          {hasFilters ? (
            <button
              className="ds-btn ds-btn--link"
              style={{ color: "var(--color-muted-foreground)" }}
              onClick={() => {
                setQ("");
                setStatus([]);
                setPlatforms([]);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
            {list.length} sugest{list.length !== 1 ? "ões" : "ão"}
          </span>
        </div>
        {showFilters ? (
          <div
            style={{
              padding: 16,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-sidebar)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <label className="ds-label" style={{ marginBottom: 8 }}>
                Status
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(CT_STATUS).map(([v, l]) => (
                  <FilterChip key={v} active={status.includes(v)} onClick={() => toggle(setStatus, v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <label className="ds-label" style={{ marginBottom: 8 }}>
                Plataforma
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(CT_PLATFORMS).map(([v, l]) => (
                  <FilterChip key={v} active={platforms.includes(v)} onClick={() => toggle(setPlatforms, v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>
          Erro ao carregar conteúdos. Por favor, tente novamente.
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 220 }} />
          ))}
        </div>
      ) : list.length ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {paged.map((c) => (
              <ContentCard
                key={c.id}
                title={c.title}
                platform={c.platform}
                theme={c.theme}
                outline={c.outline || undefined}
                mentionCount={c.mentionCount}
                relevanceScore={c.relevanceScore}
                status={c.status}
                sourceId={c.id}
                enrichText={c.theme}
                onApprove={() => {
                  if (c.status === "sugerido") return generateDraft(c.id);
                  if (c.status === "rascunho") return setSt(c.id, "em_revisao");
                  if (c.status === "em_revisao") return setSt(c.id, "aprovado");
                  if (c.status === "aprovado") return setSt(c.id, "publicado");
                }}
                onDiscard={() => setSt(c.id, "descartado")}
                action={
                  <StartProjectButton
                    sourceType="content"
                    sourceId={c.id}
                    title={c.title}
                    description={c.theme}
                    style={{ alignSelf: "flex-start" }}
                  />
                }
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : items.length ? (
        <EmptyState icon="file-text" title="Nenhum conteúdo encontrado" message="Nenhum conteúdo corresponde aos filtros selecionados." />
      ) : (
        <EmptyState
          icon="file-text"
          title="Nenhuma sugestão de conteúdo"
          message="Sugestões de conteúdo serão geradas automaticamente quando você processar conversas."
        />
      )}
    </div>
  );
};

export default ConteudosPage;
