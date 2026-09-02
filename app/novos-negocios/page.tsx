"use client";
import { useState, useMemo, useEffect, type CSSProperties } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { Button, SearchInput, OpportunityCard, EmptyState, Pagination, StartProjectButton, GenerateBusinessModal, ThemeBoard, useEnrichment, type GeneratePayload, type ThemeBoardTheme } from "@/components/ds";
import { FilterRail } from "@/components/lg/FilterRail";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";

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
}

interface ThemesResponse {
  data: ThemeBoardTheme[];
  ungrouped: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const OPP_STATUS: Record<string, string> = { nova: "Nova", analise: "Em análise", qualificada: "Qualificada", descartada: "Descartada" };
// Taxonomia atual. "servico" era um tipo legado; a purga de 2026-08-28 zerou a
// tabela e o gerador não o produz mais, então saiu do rail.
const OPP_TYPES: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema", produto: "Produto" };

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
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [f, setF] = usePersistedFilters<OppFilters>("oportunidades", INITIAL_FILTERS);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [regrouping, setRegrouping] = useState(false);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/opportunities?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const byTheme = f.view === "tema";
  // Chave condicional: quem nunca alterna para "Por tema" não paga a requisição.
  const {
    data: themeData,
    isLoading: themesLoading,
    mutate: mutateThemes,
  } = useSWR<ThemesResponse>(
    byTheme ? "/api/opportunities/themes" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const opps = useMemo(() => data?.data ?? [], [data]);

  const minScore = Number(f.minScore) || 0;

  const list = useMemo(
    () =>
      opps.filter(
        (o) =>
          (!q || o.title.toLowerCase().includes(q.toLowerCase()) || o.pain.toLowerCase().includes(q.toLowerCase())) &&
          (!f.status || o.status === f.status) &&
          (!f.types.length || f.types.includes(o.type)) &&
          o.score >= minScore &&
          (!onlyInteresting || (enrichment?.isInteresting("opportunity", o.id) ?? false))
      ),
    [opps, q, f.status, f.types, minScore, onlyInteresting, enrichment]
  );

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => {
    setPage(1);
  }, [q, f.status, f.types, minScore, onlyInteresting]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { nova: 0, analise: 0, qualificada: 0, descartada: 0 };
    opps.forEach((o) => (c[o.status] = (c[o.status] || 0) + 1));
    return c;
  }, [opps]);

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
            { value: "", label: "Todas", count: opps.length },
            ...Object.entries(OPP_STATUS).map(([value, label]) => ({ value, label, count: counts[value] || 0 })),
          ],
        },
        {
          kind: "checks",
          title: "Tipo",
          values: f.types,
          onChange: (vs) => setF({ types: vs }),
          options: Object.entries(OPP_TYPES).map(([value, label]) => ({ value, label })),
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
    <div className="pgm-opportunities-page" style={{ maxWidth: 1280, margin: "0 auto" }}>
      <ol className="pgm-process-strip" aria-label="Etapas do fluxo de inteligência">
        <li><span>1</span>Capturar conversas</li>
        <li><span>2</span>Revisar evidências</li>
        <li aria-current="step"><span>3</span>Avaliar oportunidade</li>
        <li><span>4</span>Ativar ações</li>
        <li className="pgm-process-strip__help">+ O que você faz aqui</li>
      </ol>
      <header className="pgm-opportunities-hero">
        <div>
          <p className="pgm-page-eyebrow">Observatório de oportunidades · {opps.length} negócios</p>
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
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
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
              {list.length} negócio{list.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isMobile ? <div style={{ marginBottom: 12 }}>{rail}</div> : null}

          {error ? (
            <div
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

          {byTheme ? (
            <ThemeBoard
              themes={themeData?.data ?? []}
              items={list}
              ungrouped={themeData?.ungrouped ?? 0}
              regrouping={regrouping}
              loading={isLoading || themesLoading}
              onRegroup={regroup}
              onSetPriority={setPriority}
              onOpenItem={setSelectedOpportunityId}
            />
          ) : isLoading ? (
            <div style={grid}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="ds-card" style={{ height: 160 }} />
              ))}
            </div>
          ) : list.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={grid}>
                {paged.map((o) => (
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
          ) : opps.length ? (
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

export default NovosNegociosPage;
