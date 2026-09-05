"use client";
import { Suspense, useState, useMemo, useEffect, type CSSProperties } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/http";
import { Trash2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { Button, SearchInput, OpportunityCard, EmptyState, Pagination, StartProjectButton, GenerateBusinessModal, ThemeBoard, useEnrichment, type GeneratePayload, type ThemeBoardTheme } from "@/components/ds";
import { FilterRail } from "@/components/lg/FilterRail";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  formatOpportunityStatus,
  formatOpportunityType,
} from "@/lib/presentation/labels";

const PAGE_SIZE = 20;

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  context: string | null;
  type: "treinamento" | "consultoria" | "sistema" | "produto";
  subtype?: string | null;
  generatedIdea: string | null;
  status: "nova" | "analise" | "qualificada" | "descartada";
  score: number;
  notes: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  conversationDate: string | null;
  /** Nº de conversas que sustentam o negócio (recorrência). */
  sourceCount?: number;
  /** Marca manual do usuário: 'alta' | 'media' | 'baixa', ou null. */
  priority?: string | null;
  /** Tema atribuído pelo agrupamento; null enquanto não foi agrupado. */
  themeId?: string | null;
  themeName?: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: Opportunity[];
  total: number;
  counts: Record<string, number>;
}

interface ThemesResponse {
  data: ThemeBoardTheme[];
  ungrouped: number;
}

const fetcher = fetchJson;

// Taxonomia atual. "servico" era um tipo legado; a purga de 2026-08-28 zerou a
// tabela e o gerador não o produz mais, então saiu do rail.
const OPP_STATUS = ["nova", "analise", "qualificada", "descartada"] as const;
const OPP_TYPES = ["treinamento", "consultoria", "sistema", "produto"] as const;

type OppFilters = {
  status: string;
  types: string[];
  minScore: string;
  railOpen: boolean;
  /** "negocio" = a grade de cards; "tema" = a visão agrupada. */
  view: string;
};

const INITIAL_FILTERS: OppFilters = { status: "", types: [], minScore: "0", railOpen: true, view: "negocio" };

const NovosNegociosPage = () => {
  const router = useRouter();
  const { selectedOpportunityId, setSelectedOpportunityId } = useAppStore();
  const enrichment = useEnrichment();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const isMobile = useIsMobile();
  const [q, setQ] = useState(urlQ);
  useEffect(() => { setQ(urlQ); }, [urlQ]);
  const [f, setF] = usePersistedFilters<OppFilters>("oportunidades", INITIAL_FILTERS);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [regrouping, setRegrouping] = useState(false);

  const minScore = Number(f.minScore) || 0;
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  if (q.trim()) query.set("search", q.trim());
  if (f.status) query.set("status", f.status);
  f.types.forEach((type) => query.append("type", type));
  if (minScore) query.set("minScore", String(minScore));
  if (onlyInteresting) query.set("interesting", "true");
  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    `/api/opportunities?${query}`,
    fetcher<ApiResponse>,
    { revalidateOnFocus: false }
  );

  const byTheme = f.view === "tema";
  // Chave condicional: quem nunca alterna para "Por tema" não paga a requisição.
  const {
    data: themeData,
    error: themesError,
    isLoading: themesLoading,
    mutate: mutateThemes,
  } = useSWR<ThemesResponse>(
    byTheme ? "/api/opportunities/themes" : null,
    fetcher<ThemesResponse>,
    { revalidateOnFocus: false }
  );

  const opps = useMemo(() => data?.data ?? [], [data]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (onlyInteresting) void mutate(); }, [enrichment?.isInteresting, onlyInteresting, mutate]);

  useEffect(() => {
    setPage(1);
  }, [q, f.status, f.types, minScore, onlyInteresting]);
  useEffect(() => {
    if (data && page > pageCount) setPage(pageCount);
  }, [page, pageCount, data]);

  const counts = data?.counts ?? {};
  const openOpportunity = (id: string) => {
    const opportunity = opps.find((item) => item.id === id);
    if (!opportunity) return;
    setSelectedOpportunityId(id);
    enrichment?.openEnrichment("opportunity", id, {
      title: opportunity.title,
      originalText: [opportunity.pain, opportunity.context].filter(Boolean).join("\n\n"),
      pain: opportunity.pain,
      context: opportunity.context,
      generatedIdea: opportunity.generatedIdea,
    });
  };
  const visibleThemes = useMemo(() => {
    const ids = new Set(opps.map((item) => item.id));
    return (themeData?.data ?? []).filter((theme) => theme.opportunityIds.some((id) => ids.has(id)));
  }, [themeData, opps]);
  // Theme responses exclude discarded businesses. A cached themeId alone does
  // not mean this page can display the item in a theme, so account for the
  // actual member ids returned by the board and keep every other item visible.
  const displayedThemeIds = new Set(visibleThemes.flatMap((theme) => theme.opportunityIds));
  const ungroupedItems = opps.filter((item) => !displayedThemeIds.has(item.id));

  const hasFilters = Boolean(q || f.status || f.types.length || f.minScore !== "0" || onlyInteresting);

  const clearAll = () => {
    setQ("");
    setF({ status: "", types: [], minScore: "0" });
    setOnlyInteresting(false);
  };

  const generate = async (payload: GeneratePayload) => {
    setGenerating(true);
    setGenError(null);
    setGenNote(null);
    try {
      const res = await fetch("/api/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setGenError(body?.error || `Falha ao detectar novos negócios (HTTP ${res.status}).`);
        return;
      }
      setGenNote(body?.message ?? null);
      setGenOpen(false);
      await mutate();
    } catch (err) {
      console.error("Failed to detect opportunities:", err);
      setGenError("Não foi possível detectar novos negócios. Verifique a conexão e tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  // Exclusão manual: a confirmação é obrigatória porque o DELETE apaga também as
  // fontes e não há desfazer. Atualização otimista — o card some na hora e a
  // lista volta ao servidor só para reconciliar.
  const remove = async (o: Opportunity) => {
    if (!window.confirm(`Excluir "${o.title}"?\n\nIsso remove o novo negócio e suas conversas de origem. Não há como desfazer.`)) {
      return;
    }
    setDeletingId(o.id);
    setGenError(null);
    try {
      const res = await fetch(`/api/opportunities/${o.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao excluir (HTTP ${res.status}).`);
        return;
      }
      if (selectedOpportunityId === o.id) setSelectedOpportunityId(null);
      setGenNote(`"${o.title}" foi excluído.`);
      await mutate();
    } catch (err) {
      console.error("Failed to delete opportunity:", err);
      setGenError("Não foi possível excluir. Verifique a conexão e tente novamente.");
    } finally {
      setDeletingId(null);
    }
  };

  // O agrupamento gasta uma chamada de IA e substitui o cache inteiro, então
  // roda só quando o usuário pede — nunca ao abrir a página.
  const regroup = async () => {
    setRegrouping(true);
    setGenError(null);
    setGenNote(null);
    try {
      const res = await fetch("/api/opportunities/themes", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setGenError(body?.error || `Falha ao agrupar por tema (HTTP ${res.status}).`);
        return;
      }
      setGenNote(body?.message ?? null);
      // A listagem também muda: cada card passa a carregar o tema novo.
      await Promise.all([mutateThemes(), mutate()]);
    } catch (err) {
      console.error("Failed to group themes:", err);
      setGenError("Não foi possível agrupar por tema. Verifique a conexão e tente novamente.");
    } finally {
      setRegrouping(false);
    }
  };

  // Prioridade é a única coisa que o usuário edita no negócio. Atualização
  // otimista: o select responde na hora e o servidor só reconcilia.
  const setPriority = async (id: string, priority: string | null) => {
    setGenError(null);
    const patch = (rows: Opportunity[]) =>
      rows.map((o) => (o.id === id ? { ...o, priority } : o));
    mutate(
      (prev) => (prev ? { ...prev, data: patch(prev.data) } : prev),
      { revalidate: false }
    );
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao marcar a prioridade (HTTP ${res.status}).`);
        await mutate();
      }
    } catch (err) {
      console.error("Failed to set priority:", err);
      setGenError("Não foi possível marcar a prioridade. Verifique a conexão.");
      await mutate();
    }
  };

  const rail = (
    <FilterRail
      open
      style={{ width: 200 }}
      onClear={hasFilters ? clearAll : undefined}
      sections={[
        {
          kind: "status",
          title: "Status",
          value: f.status,
          onChange: (v) => setF({ status: v }),
          options: [
            { value: "", label: "Todas", count: Object.values(counts).reduce((sum, count) => sum + count, 0) },
            ...OPP_STATUS.map((value) => ({ value, label: formatOpportunityStatus(value), count: counts[value] || 0 })),
          ],
        },
        {
          kind: "checks",
          title: "Tipo",
          values: f.types,
          onChange: (vs) => setF({ types: vs }),
          options: OPP_TYPES.map((value) => ({ value, label: formatOpportunityType(value) })),
        },
        {
          kind: "segmented",
          title: "Score mínimo",
          value: f.minScore,
          onChange: (v) => setF({ minScore: v }),
          options: [
            { value: "0", label: "Todas" },
            { value: "70", label: "70+" },
            { value: "85", label: "85+" },
          ],
        },
        {
          kind: "checks",
          title: "Filtros",
          values: onlyInteresting ? ["interesting"] : [],
          onChange: (values) => setOnlyInteresting(values.includes("interesting")),
          options: [{ value: "interesting", label: "Só interessantes" }],
        },
      ]}
    />
  );

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 0,
  };

  return (
    <div className="pgm-opportunities-page">
      <ol className="pgm-process-strip" aria-label="Etapas do fluxo de inteligência">
        <li><span>1</span>Capturar conversas</li>
        <li><span>2</span>Revisar evidências</li>
        <li aria-current="step"><span>3</span>Avaliar oportunidade</li>
        <li><span>4</span>Ativar ações</li>
        <li className="pgm-process-strip__help">+ O que você faz aqui</li>
      </ol>
      <header className="pgm-opportunities-hero">
        <div>
          <p className="pgm-page-eyebrow">Observatório de oportunidades · {total} negócios</p>
          <h1>Novos Negócios</h1>
        </div>
        <div className="pgm-opportunities-hero__actions">
          <div role="group" aria-label="Forma de ver os negócios" className="pgm-opportunities-view">
            {[
              { value: "negocio", label: "Por negócio" },
              { value: "tema", label: "Por tema" },
            ].map((opt) => (
              <button key={opt.value} type="button" aria-pressed={f.view === opt.value} onClick={() => setF({ view: opt.value })}>
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => { void mutate(); if (byTheme) void mutateThemes(); }} />
          <Button variant="outline" onClick={() => router.push("/projetos")}>Criar projeto</Button>
          <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={() => setGenOpen(true)} disabled={generating}>
            {generating ? "Detectando..." : "Detectar Negócios →"}
          </Button>
        </div>
      </header>
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

      {genNote ? (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--background) 45%, var(--backgroundContainer))",
            color: "var(--textPrimary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            font: "400 13px/18px var(--fontFamily)",
          }}
        >
          {genNote}
        </div>
      ) : null}

      {genOpen ? (
        <GenerateBusinessModal onClose={() => setGenOpen(false)} onGenerate={generate} busy={generating} />
      ) : null}

      <div className="pgm-opportunities-layout">
        {isMobile ? null : rail}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pgm-opportunities-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar negócios" />
            <span>
              {total} negócio{total !== 1 ? "s" : ""}
            </span>
          </div>

          {isMobile ? <div style={{ marginBottom: 12 }}>{rail}</div> : null}

          {error || (byTheme && themesError) ? (
            <div
              role="alert"
              style={{
                padding: 16,
                marginBottom: 16,
                background: "var(--alert-error-bg)",
                color: "var(--alert-error-fg)",
                border: "1px solid var(--alert-error-border)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              Erro ao carregar novos negócios. Por favor, tente novamente.
            </div>
          ) : null}

          {error || (byTheme && themesError) ? null : byTheme ? (
            <>
            {isLoading || themesLoading || visibleThemes.length || !themeData?.data.length ? <ThemeBoard
              themes={visibleThemes}
              items={opps}
              ungrouped={themeData?.ungrouped ?? 0}
              regrouping={regrouping}
              loading={isLoading || themesLoading}
              onRegroup={regroup}
              onSetPriority={setPriority}
              onOpenItem={openOpportunity}
            /> : null}
            {!isLoading && !opps.length ? <EmptyState icon="lightbulb" title="Nenhum negócio encontrado" message="Nenhum novo negócio corresponde aos filtros selecionados." /> : null}
            {!isLoading && ungroupedItems.length ? <section style={{ marginTop: 16 }}>
              <h2>Negócios fora dos temas exibidos</h2>
              {!themesLoading && !visibleThemes.length && Boolean(themeData?.data.length) ? <Button variant="outline" onClick={regroup} disabled={regrouping}>
                {regrouping ? "Agrupando…" : "Reagrupar"}
              </Button> : null}
              {ungroupedItems.map((item) => <button key={item.id} type="button" className="ds-btn ds-btn--link" onClick={() => openOpportunity(item.id)}>{item.title}</button>)}
            </section> : null}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
            </>
          ) : isLoading ? (
            <div style={grid}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ds-card" style={{ height: 160 }} />
              ))}
            </div>
          ) : opps.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={grid}>
                {opps.map((o) => (
                  <OpportunityCard
                    key={o.id}
                    title={o.title}
                    pain={o.pain}
                    context={o.context}
                    type={o.type}
                    subtype={o.subtype}
                    generatedIdea={o.generatedIdea}
                    sourceCount={o.sourceCount}
                    status={o.status}
                    score={o.score}
                    conversationTitle={o.conversationTitle || undefined}
                    createdAt={o.createdAt}
                    sourceId={o.id}
                    selected={selectedOpportunityId === o.id}
                    onSelect={() => setSelectedOpportunityId(o.id)}
                    action={
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StartProjectButton
                          sourceType="opportunity"
                          sourceId={o.id}
                          title={o.title}
                          description={o.pain}
                        />
                        {/* O card inteiro abre o modal; sem stopPropagation o
                            clique no lixo abriria o modal por baixo do confirm. */}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Excluir ${o.title}`}
                          title="Excluir"
                          disabled={deletingId === o.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(o);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "transparent",
                            color: "var(--color-muted-foreground)",
                            cursor: deletingId === o.id ? "wait" : "pointer",
                            opacity: deletingId === o.id ? 0.5 : 1,
                          }}
                        >
                          <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} />
            </div>
          ) : hasFilters ? (
            <EmptyState icon="lightbulb" title="Nenhum negócio encontrado" message="Nenhum novo negócio corresponde aos filtros selecionados." />
          ) : (
            <EmptyState
              icon="lightbulb"
              title="Nenhum negócio detectado"
              message="A geração é manual: escolha um período ou selecione conversas e use 'Detectar Negócios'."
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default function NovosNegociosRoute() {
  return <Suspense fallback={null}><NovosNegociosPage /></Suspense>;
}
