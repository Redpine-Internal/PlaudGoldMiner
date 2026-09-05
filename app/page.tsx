"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import { formatOpportunityStatus, formatOpportunityType } from "@/lib/presentation/labels";
import { fetchJson } from "@/lib/http";

interface DashboardData {
  greetingName: string;
  kpis: { conversations: number; opportunities: number; contents: number };
  queue: { pendingConversations: number; suggestedContents: number };
  recentConversations: { id: string; title: string; date: string }[];
  pipeline: { id: string; title: string; status: string; score: number }[];
  themes: {
    name: string;
    rationale: string | null;
    opportunities: number;
    conversations: number;
  }[];
  themeCoverage: {
    total: number;
    mapped: number;
    ungrouped: number;
    percent: number;
    updatedAt: string | null;
  };
  demand: {
    type: string;
    count: number;
    conversations: number;
    avgScore: number;
    topTitle: string | null;
    reach: number;
  }[];
  volume: { month: string; label: string; year: number; total: number }[];
  volumeMax: number;
  volumeTotal: number;
  evidence: {
    buckets: { sources: number; opportunities: number }[];
    total: number;
    max: number;
    avgSources: number;
    withoutSources: number;
    single: number;
    sourceLinks: number;
  };
  coverage: { linked: number; total: number; percent: number };
  lastProject: { id: string; title: string; description: string | null } | null;
  weekSummary: string | null;
}

const fetcher = (url: string) => fetchJson<{ data: DashboardData }>(url);

const formatDate = (value: string) => {
  // Datas de conversa não têm horário. Meio-dia local evita que 02/set vire
  // 01/set em fusos negativos ao interpretar o DATE retornado pela API.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const formatDecimal = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const DashboardPage = () => {
  const router = useRouter();
  const { data: response, isLoading, error, mutate } = useSWR<{ data: DashboardData }>("/api/dashboard", fetcher, {
    revalidateOnFocus: false,
  });
  const [isRefreshingThemes, setIsRefreshingThemes] = useState(false);
  const [themeRefreshError, setThemeRefreshError] = useState<string | null>(null);
  const data = response?.data;

  const refreshThemes = async () => {
    setIsRefreshingThemes(true);
    setThemeRefreshError(null);
    try {
      const response = await fetch("/api/opportunities/themes", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível atualizar a inteligência.");
      }
      await mutate();
    } catch (error) {
      setThemeRefreshError(
        error instanceof Error ? error.message : "Não foi possível atualizar a inteligência."
      );
    } finally {
      setIsRefreshingThemes(false);
    }
  };

  const now = new Date();
  const period = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hour = now.getHours();
  const salutation = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const greeting = `${salutation}${data?.greetingName ? `, ${data.greetingName}` : ""}. Aqui está o que suas conversas revelaram.`;

  const queue = data
    ? [
        {
          id: "pending",
          count: data.queue.pendingConversations,
          label: data.queue.pendingConversations === 1 ? "conversa para processar" : "conversas para processar",
          action: "Processar",
          href: "/conversas",
        },
        {
          id: "contents",
          count: data.queue.suggestedContents,
          label: data.queue.suggestedContents === 1 ? "conteúdo para aprovar" : "conteúdos para aprovar",
          action: "Revisar",
          href: "/conteudos",
        },
      ]
    : [];

  const kpis = [
    { label: "Conversas processadas", value: data?.kpis.conversations ?? 0, href: "/conversas" },
    { label: "Negócios ativos", value: data?.kpis.opportunities ?? 0, href: "/novos-negocios" },
    { label: "Conteúdos sugeridos", value: data?.kpis.contents ?? 0, href: "/conteudos" },
  ];

  if (error) {
    return <div className="dashboard-page" role="alert"><h1>Dashboard</h1><p>Não foi possível carregar os indicadores. Os números não estão disponíveis neste momento.</p><button type="button" className="ds-btn ds-btn--outline" onClick={() => void mutate()}>Tentar novamente</button></div>;
  }
  if (isLoading) {
    return (
      <div className="dashboard-page" aria-busy="true">
        <div className="dashboard-hero">
          <div className="ds-skeleton" style={{ width: 132, height: 14 }} />
          <div className="ds-skeleton" style={{ width: "min(520px, 84%)", height: 38, marginTop: 12 }} />
        </div>
        <div className="dashboard-flow">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="ds-card dashboard-loading-card">
              <div className="ds-skeleton" style={{ width: "42%", height: 22 }} />
              <div className="ds-skeleton" style={{ width: "88%", height: 14 }} />
              <div className="ds-skeleton" style={{ width: "68%", height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <p className="dashboard-eyebrow">{period}</p>
        <h1>Resumo</h1>
        <p>{greeting}</p>
      </header>

      <div className="dashboard-flow">
        <section className="dashboard-kpis" aria-label="Indicadores principais">
          {kpis.map(({ label, value, href }) => (
            <button key={href} type="button" className="dashboard-kpi" onClick={() => router.push(href)}>
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </section>

        <section className="dashboard-volume" aria-labelledby="volume-title">
          <div className="dashboard-section-heading">
            <div><h2 id="volume-title">Conversas por mês</h2><span className="dashboard-muted">{data?.volumeTotal ?? 0} nos últimos 12 meses</span></div>
          </div>
          <p className="dashboard-muted">O acervo que alimenta a análise. Meses sem conversa aparecem como zero.</p>
          {data?.volume.length ? (
            <div className="dashboard-chart" role="img" aria-label="Gráfico de conversas por mês nos últimos doze meses">
              {data.volume.map((item) => {
                const height = data.volumeMax > 0 ? Math.max((item.total / data.volumeMax) * 100, item.total ? 5 : 1) : 1;
                return (
                  <div key={item.month} className="dashboard-chart__column" title={`${item.label}/${String(item.year).slice(2)}: ${item.total} conversas`}>
                    <span>{item.total || ""}</span>
                    <i style={{ height: `${height}%` }} />
                    <small>{item.label}</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="dashboard-muted">Sem histórico mensal disponível.</p>}
        </section>

        <section className="ds-card dashboard-queue" aria-labelledby="queue-title">
          <p className="dashboard-section-kicker">Próximas ações</p>
          <h2 id="queue-title">Fila de trabalho</h2>
          <div className="dashboard-stack">
            {queue.some((item) => item.count > 0) ? (
              queue
                .filter((item) => item.count > 0)
                .map((item) => (
                  <button key={item.id} type="button" className="dashboard-action-row" onClick={() => router.push(item.href)}>
                    <strong>{item.count}</strong>
                    <span>{item.label}</span>
                    <span className="dashboard-row-link">{item.action} <ArrowRight size={16} aria-hidden /></span>
                  </button>
                ))
            ) : (
              <div className="dashboard-empty-inline"><ClipboardCheck size={20} aria-hidden /> Tudo em dia por aqui.</div>
            )}
          </div>
        </section>

        <section className="ds-card dashboard-summary" aria-labelledby="week-summary-title">
          <p className="dashboard-section-kicker">Movimento recente</p>
          <h2 id="week-summary-title">Últimos 7 dias</h2>
          <p className="dashboard-prose">
            {data?.weekSummary || "Não houve atividade registrada nos últimos 7 dias."}
          </p>
        </section>

        <section className="ds-card dashboard-recents" aria-labelledby="recents-title">
          <div className="dashboard-section-heading">
            <div><p className="dashboard-section-kicker">Acervo</p><h2 id="recents-title">Conversas recentes</h2></div>
            <button type="button" className="dashboard-text-action" onClick={() => router.push("/conversas")}>Ver todas</button>
          </div>
          <div className="dashboard-stack">
            {data?.recentConversations.length ? data.recentConversations.map((conversation) => (
              <button key={conversation.id} type="button" className="dashboard-list-row" onClick={() => router.push(`/conversas/${conversation.id}`)}>
                <strong>{conversation.title}</strong>
                <span>{formatDate(conversation.date)}</span>
                <ArrowRight size={16} aria-hidden />
              </button>
            )) : <p className="dashboard-muted">Nenhuma conversa disponível.</p>}
          </div>
        </section>

        <section className="ds-card dashboard-continue" aria-labelledby="continue-title">
          <p className="dashboard-section-kicker">Retomar</p>
          <h2 id="continue-title">Continuar projeto</h2>
          {data?.lastProject ? (
            <button type="button" className="dashboard-project" onClick={() => router.push(`/projetos/${data.lastProject?.id}`)}>
              <strong>{data.lastProject.title}</strong>
              {data.lastProject.description ? <span>{data.lastProject.description}</span> : null}
              <span className="dashboard-row-link">Abrir projeto <ArrowRight size={16} aria-hidden /></span>
            </button>
          ) : (
            <p className="dashboard-muted">Nenhum projeto iniciado. Transforme uma oportunidade em plano de ação.</p>
          )}
        </section>

        <section className="ds-card dashboard-demand" aria-labelledby="demand-title">
          <p className="dashboard-section-kicker">Sinais comerciais</p>
          <h2 id="demand-title">Demanda acumulada por tipo</h2>
          <p className="dashboard-muted">
            Base: {data?.coverage.linked ?? 0} conversas vinculadas a negócios ativos. Uma conversa pode sustentar mais de um tipo.
          </p>
          <div className="dashboard-demand-grid">
            {data?.demand.length ? data.demand.map((item) => (
              <button key={item.type} type="button" className="dashboard-demand-item" onClick={() => router.push("/novos-negocios")}>
                <span>{formatOpportunityType(item.type)}</span>
                <strong>{item.reach}% do acervo vinculado</strong>
                <small>{item.conversations} conversa{item.conversations === 1 ? "" : "s"} · {item.count} negócio{item.count === 1 ? "" : "s"} · confiança média da IA {item.avgScore}%</small>
                {item.topTitle ? <em>{item.topTitle}</em> : null}
                <i><b style={{ width: `${Math.max(item.reach, 2)}%` }} /></i>
              </button>
            )) : <p className="dashboard-muted">Sem demanda agrupada disponível.</p>}
          </div>
        </section>

        <section className="ds-card dashboard-evidence" aria-labelledby="evidence-title">
          <p className="dashboard-section-kicker">Rastreabilidade</p>
          <h2 id="evidence-title">Evidência por negócio</h2>
          <div className="dashboard-evidence-hero"><strong>{formatDecimal(data?.evidence.avgSources ?? 0)}</strong><span>conversas por negócio, em média</span></div>
          <p className="dashboard-muted dashboard-evidence-basis">
            {data?.evidence.total ?? 0} negócios ativos · {data?.evidence.sourceLinks ?? 0} vínculos de evidência
          </p>
          <div className="dashboard-evidence-bars" aria-label="Distribuição das fontes por oportunidade">
            {data?.evidence.buckets.length ? data.evidence.buckets.map((bucket) => {
              const width = data.evidence.max ? Math.max((bucket.opportunities / data.evidence.max) * 100, 2) : 2;
              return (
                <div key={bucket.sources}>
                  <span>{bucket.sources} fonte{bucket.sources === 1 ? "" : "s"}</span>
                  <i><b style={{ width: `${width}%` }} /></i>
                  <strong>{bucket.opportunities}</strong>
                </div>
              );
            }) : <p className="dashboard-muted">Ainda não há negócios ativos para avaliar.</p>}
          </div>
          <div className="dashboard-evidence-notes">
            {data?.evidence.withoutSources ? <p className="dashboard-muted">{data.evidence.withoutSources} negócio{data.evidence.withoutSources === 1 ? " ainda não tem" : "s ainda não têm"} conversa de origem vinculada.</p> : null}
            {data?.evidence.single ? <p className="dashboard-muted">{data.evidence.single} negócio{data.evidence.single === 1 ? " ainda depende" : "s ainda dependem"} de uma única conversa.</p> : null}
          </div>
        </section>

        <section className="ds-card dashboard-coverage" aria-labelledby="coverage-title">
          {(data?.coverage.total ?? 0) > 0 ? (
            <>
              <p className="dashboard-section-kicker">Aproveitamento comercial</p>
              <h2 id="coverage-title">Conversas usadas em negócios</h2>
              <div className="dashboard-coverage-value">
                {data?.coverage.linked ?? 0}<span> de {data?.coverage.total ?? 0}</span>
              </div>
              <p className="dashboard-muted dashboard-coverage-lead">
                <strong>As {data?.coverage.total ?? 0} conversas deste indicador já foram processadas.</strong>{" "}
                Destas, {data?.coverage.linked ?? 0} foram vinculadas como evidência a pelo menos um negócio ativo.
              </p>
              <div className="dashboard-meter" aria-hidden><span style={{ width: `${data?.coverage.percent ?? 0}%` }} /></div>
              <p className="dashboard-muted">
                <strong>{data?.coverage.percent ?? 0}% do acervo possui vínculo com negócios ativos.</strong>{" "}
                {(data?.coverage.total ?? 0) - (data?.coverage.linked ?? 0)} conversa{(data?.coverage.total ?? 0) - (data?.coverage.linked ?? 0) === 1 ? " processada ainda não possui" : "s processadas ainda não possuem"} esse vínculo.
              </p>
            </>
          ) : (
            <>
              <p className="dashboard-section-kicker">Aproveitamento comercial</p>
              <h2 id="coverage-title">Conversas usadas em negócios</h2>
              <p className="dashboard-muted">Ainda não há conversas processadas para avaliar.</p>
            </>
          )}
        </section>

        <section className="ds-card dashboard-themes" aria-labelledby="themes-title">
          <div className="dashboard-section-heading">
            <div><p className="dashboard-section-kicker">Inteligência da base</p><h2 id="themes-title">Temas de negócios</h2></div>
            {(data?.themeCoverage?.total ?? 0) > 0 ? (
              <button
                type="button"
                className="dashboard-text-action"
                onClick={refreshThemes}
                disabled={isRefreshingThemes}
              >
                {isRefreshingThemes ? "Atualizando…" : "Atualizar inteligência"}
              </button>
            ) : null}
          </div>
          <p className="dashboard-muted dashboard-theme-coverage">
            A IA agrupou {data?.themeCoverage?.mapped ?? 0} de {data?.themeCoverage?.total ?? 0} negócios ativos ({data?.themeCoverage?.percent ?? 0}%).
            {(data?.themeCoverage?.ungrouped ?? 0) > 0
              ? ` ${data?.themeCoverage?.ungrouped} aguardam reagrupamento.`
              : " A leitura está completa para a base atual."}
            {formatUpdatedAt(data?.themeCoverage?.updatedAt)
              ? ` Atualizada em ${formatUpdatedAt(data?.themeCoverage?.updatedAt)}.`
              : ""}
          </p>
          {themeRefreshError ? <p className="dashboard-inline-error" role="alert">{themeRefreshError}</p> : null}
          <div className="dashboard-stack">
            {data?.themes.length ? data.themes.map((theme) => (
              <div key={theme.name} className="dashboard-theme-row">
                <strong>{theme.name}</strong>
                <span>{theme.conversations} conversa{theme.conversations === 1 ? "" : "s"}</span>
                <span>{theme.opportunities} negócio{theme.opportunities === 1 ? "" : "s"}</span>
                {theme.rationale ? <small>{theme.rationale}</small> : null}
              </div>
            )) : <p className="dashboard-muted">Ainda não há temas calculados para os negócios ativos.</p>}
          </div>
        </section>

        <section className="ds-card dashboard-pipeline" aria-labelledby="pipeline-title">
          <div className="dashboard-section-heading">
            <div><p className="dashboard-section-kicker">Oportunidades</p><h2 id="pipeline-title">Pipeline de novos negócios</h2></div>
            <button type="button" className="dashboard-text-action" onClick={() => router.push("/novos-negocios")}>Ver pipeline</button>
          </div>
          <div className="dashboard-stack">
            {data?.pipeline.length ? data.pipeline.map((opportunity) => (
              <button key={opportunity.id} type="button" className="dashboard-list-row dashboard-list-row--three" onClick={() => router.push("/novos-negocios")}>
                <strong>{opportunity.title}</strong>
                <span>{formatOpportunityStatus(opportunity.status)}</span>
                <span className="dashboard-score" title="Confiança da classificação feita pela IA">Confiança {Math.round(opportunity.score)}%</span>
              </button>
            )) : <p className="dashboard-muted">Nenhuma oportunidade no pipeline.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
