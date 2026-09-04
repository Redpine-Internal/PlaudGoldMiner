"use client";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { Button, SearchInput, FilterChip, ContentCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";
import { FilterRail } from "@/components/lg/FilterRail";
import type { FilterRailSection, FilterOption } from "@/components/lg/FilterRail";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatContentFormat, formatContentStatus } from "@/lib/presentation/labels";

const PAGE_SIZE = 20;

interface Content {
  id: string;
  title: string;
  /** Formato do conteúdo. Valores legados (youtube/linkedin/blog) foram
   *  migrados em 2026-08-28, mas o tipo segue aberto para não quebrar a UI. */
  platform: string;
  subtype: string | null;
  theme: string;
  outline: string | null;
  draft?: string | null;
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

const CT_STATUS = ["sugerido", "rascunho", "em_revisao", "aprovado", "publicado", "descartado", "producao"] as const;
// Formatos de conteúdo (taxonomia 2026-08-28). O filtro é por formato; o
// subtipo é texto livre e aparece no card, não no rail.
const CT_PLATFORMS = ["artigo", "post", "carrossel", "roteiro"] as const;

type ConteudoFilters = { status: string; platforms: string[]; railOpen: boolean };

const ConteudosPage = () => {
  const enrichment = useEnrichment();
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [f, setF] = usePersistedFilters<ConteudoFilters>("conteudos", { status: "", platforms: [], railOpen: true });
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/contents?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const items = useMemo(() => data?.data ?? [], [data]);

  // Busca + "só interessantes" (contexto comum a lista e contadores do rail).
  const base = useMemo(
    () =>
      items.filter(
        (c) =>
          (!q || c.title.toLowerCase().includes(q.toLowerCase()) || c.theme.toLowerCase().includes(q.toLowerCase())) &&
          (!onlyInteresting || (enrichment?.isInteresting("content", c.id) ?? false))
      ),
    [items, q, onlyInteresting, enrichment]
  );

  // Aplica plataformas — é sobre este conjunto que os contadores de status contam.
  const statusBase = useMemo(
    () => base.filter((c) => !f.platforms.length || f.platforms.includes(c.platform)),
    [base, f.platforms]
  );

  const list = useMemo(() => statusBase.filter((c) => !f.status || c.status === f.status), [statusBase, f.status]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => {
    setPage(1);
  }, [q, f.status, f.platforms, onlyInteresting]);
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
    setDrafting(id);
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
    } finally {
      setDrafting(null);
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

  /* ── Rail de filtros (desktop: aside 220px; mobile: chips roláveis) ── */

  const statusOptions = useMemo<FilterOption[]>(() => {
    const counts: Record<string, number> = {};
    for (const c of statusBase) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return [
      { value: "", label: "Todos", count: statusBase.length },
      ...CT_STATUS
        .filter((s) => s !== "producao" || counts.producao || f.status === "producao")
        .map((s) => ({ value: s, label: formatContentStatus(s), count: counts[s] ?? 0 })),
    ];
  }, [statusBase, f.status]);

  const platformOptions = useMemo<FilterOption[]>(() => {
    const present = new Set<string>(items.map((c) => c.platform));
    for (const p of f.platforms) present.add(p);
    return [
      ...CT_PLATFORMS,
      ...[...present].filter((p) => !CT_PLATFORMS.includes(p as (typeof CT_PLATFORMS)[number])),
    ].map((p) => ({ value: p, label: formatContentFormat(p) }));
  }, [items, f.platforms]);

  const sections = useMemo<FilterRailSection[]>(() => {
    const s: FilterRailSection[] = [
      { kind: "status", title: "Status", options: statusOptions, value: f.status, onChange: (v) => setF({ status: v }) },
    ];
    if (platformOptions.length) {
      s.push({ kind: "checks", title: "Plataforma", options: platformOptions, values: f.platforms, onChange: (vs) => setF({ platforms: vs }) });
    }
    s.push({
      kind: "checks",
      title: "Filtros",
      options: [{ value: "interesting", label: "Só interessantes" }],
      values: onlyInteresting ? ["interesting"] : [],
      onChange: (values) => setOnlyInteresting(values.includes("interesting")),
    });
    return s;
  }, [statusOptions, platformOptions, f.status, f.platforms, onlyInteresting, setF]);

  const railFilterCount = (f.status ? 1 : 0) + f.platforms.length + (onlyInteresting ? 1 : 0);

  const rail = (
    <FilterRail
      open
      sections={sections}
      style={{ width: 200 }}
      onClear={railFilterCount ? () => { setF({ status: "", platforms: [] }); setOnlyInteresting(false); } : undefined}
    />
  );

  /* ── Cabeçalho editorial e ferramentas da coleção ── */

  const header = (
    <header className="pgm-content-hero">
      <div>
        <p className="pgm-page-eyebrow">Estúdio editorial · {items.length} sugestões</p>
        <h1>Conteúdos</h1>
      </div>
      <div className="pgm-content-hero__actions">
        {isMobile ? null : (
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        )}
        <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={generate} disabled={generating}>
          {generating ? "Gerando..." : "Gerar Conteúdos →"}
        </Button>
        {isMobile ? (
          <Button variant="outline" onClick={() => setMobileActionsOpen((open) => !open)}>
            Mais ações ▾
          </Button>
        ) : null}
      </div>
      {isMobile && mobileActionsOpen ? (
        <div className="pgm-content-mobile-actions">
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} onClick={() => mutate()}>
            Atualizar lista
          </Button>
        </div>
      ) : null}
    </header>
  );

  const collectionToolbar = (
    <div className="pgm-content-toolbar">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar conteúdos" />
      {isMobile ? (
        <FilterChip active={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)} count={railFilterCount || null}>
          Filtros
        </FilterChip>
      ) : null}
      <span className="pgm-content-toolbar__count">
        <strong>{list.length}</strong>
        <span>sugest{list.length !== 1 ? "ões" : "ão"}</span>
      </span>
    </div>
  );

  /* ── Conteúdo: alertas, grid de cards, paginação, vazios ── */

  const content = (
    <>
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
            font: "400 13px/18px var(--fontFamily)",
          }}
        >
          {genError}
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>
          Erro ao carregar conteúdos. Por favor, tente novamente.
        </div>
      ) : null}

      {isLoading ? (
        <div className="pgm-content-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ds-card pgm-content-card" style={{ height: 220 }} />
          ))}
        </div>
      ) : list.length ? (
        <>
          <div className="pgm-content-grid">
            {paged.map((c) => (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <ContentCard
                  style={{ height: "auto", flex: 1 }}
                  title={c.title}
                  platform={c.platform}
                  subtype={c.subtype}
                  theme={c.theme}
                  outline={c.outline || undefined}
                  mentionCount={c.mentionCount}
                  relevanceScore={c.relevanceScore}
                  status={c.status}
                  createdAt={c.createdAt}
                  sourceId={c.id}
                  enrichText={c.theme}
                  draft={c.draft}
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
                  footer={c.draft ? (
                    <details>
                      <summary style={{ font: "500 12px/16px var(--fontFamily)", cursor: "pointer" }}>Editar / regerar rascunho</summary>
                      <DraftEditor id={c.id} draft={c.draft} onSaved={mutate} onRegenerate={() => generateDraft(c.id)} regenerating={drafting === c.id} />
                    </details>
                  ) : undefined}
                />
              </div>
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
    </>
  );

  /* ── Layout: desktop = rail à esquerda da coluna; mobile = chips no topo ── */

  if (isMobile) {
    return (
      <div className="pgm-content-page">
        {header}
        {collectionToolbar}
        {mobileFiltersOpen ? <div className="pgm-content-mobile-filters">{rail}</div> : null}
        {content}
      </div>
    );
  }

  return (
    <div className="pgm-content-page">
      {header}
      <div className="pgm-content-layout">
        <div className="pgm-content-rail">
          {rail}
          <div className="pgm-content-flow" aria-label="Fluxo editorial">
            <p>Fluxo</p>
            <span>Sugestão → rascunho → revisão → publicação</span>
          </div>
        </div>
        <div className="pgm-content-results">
          {collectionToolbar}
          {content}
        </div>
      </div>
    </div>
  );
};

export default ConteudosPage;

function DraftEditor({
  id,
  draft,
  onSaved,
  onRegenerate,
  regenerating,
}: {
  id: string;
  draft: string;
  onSaved: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [text, setText] = useState(draft);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(draft), [draft]);
  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/contents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: text }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        style={{ width: "100%", boxSizing: "border-box", font: "400 13px/19px var(--fontFamily)", background: "transparent", color: "inherit", border: "1px solid var(--color-border)", borderRadius: 5, padding: 8, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={saving || text === draft}>
          {saving ? "Salvando..." : "Salvar rascunho"}
        </Button>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? "Regenerando..." : "Regenerar"}
        </Button>
      </div>
    </div>
  );
}
