"use client";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { SlidersHorizontal } from "lucide-react";
import { Button, SearchInput, FilterChip, ContentCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";
import { FilterRail } from "@/components/lg/FilterRail";
import type { FilterRailSection, FilterOption } from "@/components/lg/FilterRail";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";

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

const CT_STATUS: Record<string, string> = {
  sugerido: "Sugerido", rascunho: "Rascunho", em_revisao: "Em revisão",
  aprovado: "Aprovado", descartado: "Descartado", producao: "Em produção", publicado: "Publicado",
};
// Formatos de conteúdo (taxonomia 2026-08-28). O filtro é por formato; o
// subtipo é texto livre e aparece no card, não no rail.
const CT_PLATFORMS: Record<string, string> = { artigo: "Artigo", post: "Post", carrossel: "Carrossel", roteiro: "Roteiro" };

type ConteudoFilters = { status: string; platforms: string[]; railOpen: boolean };

const ConteudosPage = () => {
  const enrichment = useEnrichment();
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [f, setF] = usePersistedFilters<ConteudoFilters>("conteudos", { status: "", platforms: [], railOpen: true });
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/contents?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const items = data?.data || [];

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
    const present = new Set<string>(items.map((c) => c.status));
    if (f.status) present.add(f.status);
    return [
      { value: "", label: "Todos", count: statusBase.length },
      ...Object.keys(CT_STATUS)
        .filter((s) => present.has(s))
        .map((s) => ({ value: s, label: CT_STATUS[s], count: counts[s] ?? 0 })),
    ];
  }, [items, statusBase, f.status]);

  const platformOptions = useMemo<FilterOption[]>(() => {
    const present = new Set<string>(items.map((c) => c.platform));
    for (const p of f.platforms) present.add(p);
    return [
      ...Object.keys(CT_PLATFORMS).filter((p) => present.has(p)),
      ...[...present].filter((p) => !(p in CT_PLATFORMS)),
    ].map((p) => ({ value: p, label: CT_PLATFORMS[p] ?? p }));
  }, [items, f.platforms]);

  const sections = useMemo<FilterRailSection[]>(() => {
    const s: FilterRailSection[] = [
      { kind: "status", title: "Status", options: statusOptions, value: f.status, onChange: (v) => setF({ status: v }) },
    ];
    if (platformOptions.length) {
      s.push({ kind: "checks", title: "Plataforma", options: platformOptions, values: f.platforms, onChange: (vs) => setF({ platforms: vs }) });
    }
    return s;
  }, [statusOptions, platformOptions, f.status, f.platforms, setF]);

  const railFilterCount = (f.status ? 1 : 0) + f.platforms.length;

  const rail = (
    <FilterRail
      open={f.railOpen}
      sections={sections}
      onClear={railFilterCount ? () => setF({ status: "", platforms: [] }) : undefined}
    />
  );

  /* ── Cabeçalho da view: busca, alternador do rail, ações, contador ── */

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8, marginBottom: 16 }}>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar conteúdos..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
      {isMobile ? null : (
        <FilterChip
          active={f.railOpen}
          onClick={() => setF({ railOpen: !f.railOpen })}
          count={railFilterCount || null}
          style={{ gap: 6 }}
        >
          <SlidersHorizontal size={16} strokeWidth={1.75} />
          Filtros
        </FilterChip>
      )}
      <FilterChip active={onlyInteresting} onClick={() => setOnlyInteresting((v) => !v)}>
        Só interessantes
      </FilterChip>
      <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={generate} disabled={generating}>
        {generating ? "Gerando..." : "Gerar Conteúdos"}
      </Button>
      <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
      <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-muted-foreground)" }}>
        {list.length} sugest{list.length !== 1 ? "ões" : "ão"}
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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 220 }} />
          ))}
        </div>
      ) : list.length ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
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
                />
                {c.draft ? (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ font: "500 12px/16px var(--fontFamily)", cursor: "pointer" }}>Editar / regerar rascunho</summary>
                    <DraftEditor id={c.id} draft={c.draft} onSaved={mutate} onRegenerate={() => generateDraft(c.id)} regenerating={drafting === c.id} />
                  </details>
                ) : null}
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
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {header}
        <div style={{ marginBottom: 12 }}>{rail}</div>
        {content}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>
      {rail}
      <div style={{ flex: 1, minWidth: 0 }}>
        {header}
        {content}
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
