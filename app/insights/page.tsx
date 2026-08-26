"use client";
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { Button, SearchInput, FilterChip, InsightCard, EmptyState, Pagination, StartProjectButton, useEnrichment } from "@/components/ds";

const PAGE_SIZE = 20;

interface Insight {
  id: string;
  title: string;
  description: string;
  pattern: string;
  insightType: string;
  confidence: number;
  status: string;
  actionSuggestion: string | null;
  conversationTitle?: string | null;
  createdAt: string;
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
}

interface ApiResponse {
  data: Insight[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const IN_TYPES: Record<string, string> = {
  pattern: "Padrão",
  connection: "Conexão",
  trend: "Tendência",
  suggestion: "Sugestão",
  opportunity: "Oportunidade",
};
const IN_STATUS: Record<string, string> = { new: "Novos", useful: "Úteis", dismissed: "Dispensados", archived: "Arquivados" };

const InsightsPage = () => {
  const enrichment = useEnrichment();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [onlyInteresting, setOnlyInteresting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [askPrevious, setAskPrevious] = useState(false);
  const [onlyReal, setOnlyReal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<"insights" | "padroes">("insights");

  // limit=200 (teto da API) para trazer o histórico completo de insights.
  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/insights?limit=200",
    fetcher,
    { revalidateOnFocus: false }
  );

  const items = data?.data || [];

  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          (!q ||
            i.title.toLowerCase().includes(q.toLowerCase()) ||
            i.description.toLowerCase().includes(q.toLowerCase())) &&
          (!status.length || status.includes(i.status)) &&
          (!types.length || types.includes(i.insightType)) &&
          (showArchived || i.status !== "archived") &&
          (!onlyInteresting || (enrichment?.isInteresting("insight", i.id) ?? false))
      ),
    [items, q, status, types, showArchived, onlyInteresting, enrichment]
  );
  const visible = onlyReal ? list.filter((i) => i.insightType === "opportunity") : list;
  const patterns = items.filter((i) => i.insightType === "pattern");
  const byTheme = new Map<string, Insight[]>();
  for (const pattern of patterns) {
    const key = pattern.title.trim().toLowerCase();
    byTheme.set(key, [...(byTheme.get(key) ?? []), pattern]);
  }

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = useMemo(() => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [visible, page]);

  // Volta pra 1ª página quando a filtragem muda o conjunto, ou se a página atual
  // deixou de existir (ex.: após dispensar itens).
  useEffect(() => {
    setPage(1);
  }, [q, status, types, showArchived, onlyInteresting]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const setSt = async (id: string, s: string) => {
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      mutate();
    } catch (err) {
      console.error("Failed to update insight status:", err);
    }
  };

  const generate = async (previous?: "manter" | "arquivar" | "descartar") => {
    setAskPrevious(false);
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previous ? { previous } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setGenError(body?.error || `Falha ao gerar insights (HTTP ${res.status}).`);
        return;
      }
      await mutate();
    } catch (err) {
      console.error("Failed to generate insights:", err);
      setGenError("Não foi possível gerar insights. Verifique a conexão e tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const onGenerateClick = () => {
    const hasUnread = (data?.data ?? []).some((i) => i.status === "new");
    if (hasUnread) setAskPrevious(true);
    else generate();
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    setter((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const hasFilters = q || status.length || types.length || onlyReal || showArchived;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>IA Insights</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="primary" icon="sparkles" iconSpin={generating} onClick={onGenerateClick} disabled={generating}>
            {generating ? "Gerando..." : "Gerar Insights"}
          </Button>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        </div>
      </div>

      {askPrevious ? (
        <div className="ds-card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ font: "400 13px/18px var(--font-sans)" }}>
            Há insights ainda não consultados. O que fazer com eles antes de gerar novos?
          </span>
          <Button variant="outline" size="sm" onClick={() => generate("manter")}>Manter</Button>
          <Button variant="outline" size="sm" onClick={() => generate("arquivar")}>Arquivar</Button>
          <Button variant="outline" size="sm" onClick={() => generate("descartar")}>Descartar</Button>
        </div>
      ) : null}

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
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={tab === "insights" ? "primary" : "outline"} size="sm" onClick={() => setTab("insights")}>Insights</Button>
          <Button variant={tab === "padroes" ? "primary" : "outline"} size="sm" onClick={() => setTab("padroes")}>Padrões observados</Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar insights..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
          <FilterChip active={showFilters || !!hasFilters} onClick={() => setShowFilters(!showFilters)}>
            Filtros
          </FilterChip>
          <FilterChip active={onlyInteresting} onClick={() => setOnlyInteresting((v) => !v)}>
            Só interessantes
          </FilterChip>
          <FilterChip active={onlyReal} onClick={() => setOnlyReal((v) => !v)}>
            Somente oportunidades reais
          </FilterChip>
          <FilterChip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
            Arquivados
          </FilterChip>
          {hasFilters ? (
            <button
              className="ds-btn ds-btn--link"
              style={{ color: "var(--color-muted-foreground)" }}
              onClick={() => {
                setQ("");
                setStatus([]);
                setTypes([]);
                setOnlyReal(false);
                setShowArchived(false);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
            {visible.length} insight{visible.length !== 1 ? "s" : ""}
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
                {Object.entries(IN_STATUS).map(([v, l]) => (
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
                {Object.entries(IN_TYPES).map(([v, l]) => (
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
          Erro ao carregar insights. Por favor, tente novamente.
        </div>
      ) : null}

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ height: 180 }} />
          ))}
        </div>
      ) : tab === "padroes" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...byTheme.values()].map((group) => {
            const latest = group[0];
            const history = [...group].reverse();
            return (
              <div key={latest.id} className="ds-card">
                <h3 style={{ font: "400 16px/24px var(--fontFamily)", margin: 0 }}>{latest.title}</h3>
                <p style={{ margin: "4px 0 0", font: "500 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                  📊 {latest.pattern}
                  {history.length > 1
                    ? ` · Evolução: ${history.map((h) => h.frequency ?? "?").join(" → ")} (${history.length} gerações)`
                    : ""}
                </p>
                <a href={`/insights/${latest.id}`} style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>
                  Detalhes →
                </a>
              </div>
            );
          })}
          {byTheme.size === 0 ? (
            <p style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
              Nenhum padrão observado ainda. Gere insights para popular esta aba.
            </p>
          ) : null}
        </div>
      ) : visible.length ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
            {paged.map((i) => (
              <InsightCard
                key={i.id}
                title={i.title}
                description={i.description}
                insightType={i.insightType}
                actionSuggestion={i.actionSuggestion || undefined}
                recurrenceLabel={i.frequency && i.analyzedCount ? i.pattern : undefined}
                businessType={i.businessType}
                methodology={i.methodology}
                evidence={i.evidence}
                badge={i.insightType === "opportunity" ? (
                  <span className="ds-badge ds-badge--compact" style={{ background: "var(--accent-success)", color: "var(--textButtonPrimary)" }}>
                    Oportunidade real
                  </span>
                ) : null}
                isNew={i.status === "new"}
                sourceId={i.id}
                enrichText={i.description}
                onMarkUseful={i.status !== "useful" ? () => setSt(i.id, "useful") : undefined}
                onDismiss={i.status !== "dismissed" ? () => setSt(i.id, "dismissed") : undefined}
                action={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <StartProjectButton
                      sourceType="insight"
                      sourceId={i.id}
                      title={i.title}
                      description={i.description}
                      style={{ alignSelf: "flex-start" }}
                    />
                    <a href={`/insights/${i.id}`} onClick={(e) => e.stopPropagation()} style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}>
                      Detalhes →
                    </a>
                  </div>
                }
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : items.length ? (
        <EmptyState icon="file-text" title="Nenhum insight encontrado" message="Nenhum insight corresponde aos filtros selecionados." />
      ) : (
        <EmptyState
          icon="file-text"
          title="Nenhum insight cruzado"
          message="Clique em Gerar Insights para analisar as conversas processadas e descobrir padrões, conexões e tendências."
        />
      )}
    </div>
  );
};

export default InsightsPage;
