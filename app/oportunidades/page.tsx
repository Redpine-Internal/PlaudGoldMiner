"use client";
import { useState, useMemo, useEffect, type CSSProperties } from "react";
import useSWR from "swr";
import { SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { Button, SearchInput, FilterChip, OpportunityCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";
import { FilterRail } from "@/components/lg/FilterRail";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";

const PAGE_SIZE = 20;

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  context: string | null;
  type: "treinamento" | "consultoria" | "sistema" | "produto" | "servico";
  subtype?: string | null;
  generatedIdea: string | null;
  status: "nova" | "analise" | "qualificada" | "descartada";
  score: number;
  notes: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  conversationDate: string | null;
  createdAt: string;
}

interface ApiResponse {
  data: Opportunity[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const OPP_STATUS: Record<string, string> = { nova: "Nova", analise: "Em análise", qualificada: "Qualificada", descartada: "Descartada" };
const OPP_TYPES: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema", produto: "Produto", servico: "Serviço" };

type OppFilters = {
  status: string;
  types: string[];
  minScore: string;
  railOpen: boolean;
};

const INITIAL_FILTERS: OppFilters = { status: "", types: [], minScore: "0", railOpen: true };

const OportunidadesPage = () => {
  const { selectedOpportunityId, setSelectedOpportunityId } = useAppStore();
  const enrichment = useEnrichment();
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [f, setF] = usePersistedFilters<OppFilters>("oportunidades", INITIAL_FILTERS);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/opportunities?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const opps = data?.data || [];

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

  const hasFilters = Boolean(q || f.status || f.types.length || f.minScore !== "0");
  const activeCount = (f.status ? 1 : 0) + f.types.length + (f.minScore !== "0" ? 1 : 0);

  const clearAll = () => {
    setQ("");
    setF({ status: "", types: [], minScore: "0" });
  };

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/opportunities/analyze", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao detectar oportunidades (HTTP ${res.status}).`);
        return;
      }
      await mutate();
    } catch (err) {
      console.error("Failed to detect opportunities:", err);
      setGenError("Não foi possível detectar oportunidades. Verifique a conexão e tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const rail = (
    <FilterRail
      open={f.railOpen}
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
      ]}
    />
  );

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {isMobile ? null : rail}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8, marginBottom: 16 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar oportunidades..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
            {isMobile ? null : (
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                aria-pressed={f.railOpen}
                onClick={() => setF({ railOpen: !f.railOpen })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  background: f.railOpen ? "rgba(120,120,128,0.24)" : undefined,
                }}
              >
                <SlidersHorizontal size={16} strokeWidth={1.75} />
                Filtros{activeCount ? ` · ${activeCount}` : ""}
              </button>
            )}
            <FilterChip active={onlyInteresting} onClick={() => setOnlyInteresting((v) => !v)}>
              Só interessantes
            </FilterChip>
            <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={generate} disabled={generating}>
              {generating ? "Detectando..." : "Detectar Oportunidades"}
            </Button>
            <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-muted-foreground)" }}>
              {list.length} oportunidade{list.length !== 1 ? "s" : ""}
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
              Erro ao carregar oportunidades. Por favor, tente novamente.
            </div>
          ) : null}

          {isLoading ? (
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
                    status={o.status}
                    score={o.score}
                    conversationTitle={o.conversationTitle || undefined}
                    createdAt={o.createdAt}
                    sourceId={o.id}
                    selected={selectedOpportunityId === o.id}
                    onSelect={() => setSelectedOpportunityId(o.id)}
                    action={
                      <StartProjectButton
                        sourceType="opportunity"
                        sourceId={o.id}
                        title={o.title}
                        description={o.pain}
                      />
                    }
                  />
                ))}
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} />
            </div>
          ) : opps.length ? (
            <EmptyState icon="lightbulb" title="Nenhuma oportunidade encontrada" message="Nenhuma oportunidade corresponde aos filtros selecionados." />
          ) : (
            <EmptyState
              icon="lightbulb"
              title="Nenhuma oportunidade detectada"
              message="Oportunidades de negócio serão detectadas automaticamente quando você processar suas conversas."
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OportunidadesPage;
