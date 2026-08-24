"use client";
import type React from "react";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { Button, SearchInput, FilterChip, ContentCard, EmptyState } from "@/components/ds";

interface Content {
  id: string;
  title: string;
  platform: "youtube" | "linkedin" | "blog";
  theme: string;
  outline: string | null;
  mentionCount: number;
  relevanceScore: number;
  status: "sugerido" | "producao" | "publicado" | "descartado";
  notes: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: Content[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CT_STATUS: Record<string, string> = { sugerido: "Sugerido", producao: "Em produção", publicado: "Publicado", descartado: "Descartado" };
const CT_PLATFORMS: Record<string, string> = { youtube: "YouTube", linkedin: "LinkedIn", blog: "Blog" };

const ConteudosPage = () => {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

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
          (!platforms.length || platforms.includes(c.platform))
      ),
    [items, q, status, platforms]
  );

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
            background: "var(--type-informal-bg)",
            color: "var(--accent-error)",
            border: "1px solid var(--accent-error)",
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
        <div style={{ padding: 16, marginBottom: 16, background: "var(--type-informal-bg)", color: "var(--accent-error)", borderRadius: "var(--radius-lg)" }}>
          Erro ao carregar conteúdos. Por favor, tente novamente.
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 220 }} />
          ))}
        </div>
      ) : list.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          {list.map((c) => (
            <ContentCard
              key={c.id}
              title={c.title}
              platform={c.platform}
              theme={c.theme}
              outline={c.outline || undefined}
              mentionCount={c.mentionCount}
              relevanceScore={c.relevanceScore}
              status={c.status}
              onApprove={() => setSt(c.id, "producao")}
              onDiscard={() => setSt(c.id, "descartado")}
              onPublish={() => setSt(c.id, "publicado")}
            />
          ))}
        </div>
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
