"use client";
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useAppStore } from "@/stores/appStore";
import { Button, SearchInput, FilterChip, OpportunityCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";

const PAGE_SIZE = 20;

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  context: string | null;
  type: "produto" | "sistema" | "consultoria" | "servico";
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
const OPP_TYPES: Record<string, string> = { produto: "Produto", sistema: "Sistema", consultoria: "Consultoria", servico: "Serviço" };

const OportunidadesPage = () => {
  const { selectedOpportunityId, setSelectedOpportunityId } = useAppStore();
  const enrichment = useEnrichment();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/opportunities?limit=100",
    fetcher,
    { revalidateOnFocus: false }
  );

  const opps = data?.data || [];

  const list = useMemo(
    () =>
      opps.filter(
        (o) =>
          (!q || o.title.toLowerCase().includes(q.toLowerCase()) || o.pain.toLowerCase().includes(q.toLowerCase())) &&
          (!status.length || status.includes(o.status)) &&
          (!types.length || types.includes(o.type)) &&
          (!onlyInteresting || (enrichment?.isInteresting("opportunity", o.id) ?? false))
      ),
    [opps, q, status, types, onlyInteresting, enrichment]
  );

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => {
    setPage(1);
  }, [q, status, types, onlyInteresting]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { nova: 0, analise: 0, qualificada: 0, descartada: 0 };
    opps.forEach((o) => (c[o.status] = (c[o.status] || 0) + 1));
    return c;
  }, [opps]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    setter((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const hasFilters = q || status.length || types.length;

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

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Oportunidades</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={generate} disabled={generating}>
            {generating ? "Detectando..." : "Detectar Oportunidades"}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        {Object.entries(counts).map(([s, n]) => (
          <div
            key={s}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-lg)",
              background: `var(--opp-${s}-bg)`,
              color: `var(--opp-${s}-fg)`,
              font: "400 14px/20px var(--font-sans)",
              boxShadow: status.includes(s) ? "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-primary)" : "none",
              cursor: "pointer",
            }}
            onClick={() => toggle(setStatus, s)}
          >
            <span style={{ fontWeight: 500 }}>{n}</span> <span>{OPP_STATUS[s]}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar oportunidades..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
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
                setTypes([]);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
            {list.length} oportunidade{list.length !== 1 ? "s" : ""}
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
                {Object.entries(OPP_STATUS).map(([v, l]) => (
                  <FilterChip key={v} active={status.includes(v)} onClick={() => toggle(setStatus, v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <label className="ds-label" style={{ marginBottom: 8 }}>
                Tipo
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(OPP_TYPES).map(([v, l]) => (
                  <FilterChip key={v} active={types.includes(v)} onClick={() => toggle(setTypes, v)}>
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
          Erro ao carregar oportunidades. Por favor, tente novamente.
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="ds-card" style={{ height: 160 }} />
            ))}
          </div>
        ) : list.length ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {paged.map((o) => (
                <OpportunityCard
                  key={o.id}
                  title={o.title}
                  pain={o.pain}
                  type={o.type}
                  status={o.status}
                  score={o.score}
                  conversationTitle={o.conversationTitle || undefined}
                  createdAt={o.createdAt}
                  sourceId={o.id}
                  enrichText={o.pain}
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
          </>
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
  );
};

export default OportunidadesPage;
