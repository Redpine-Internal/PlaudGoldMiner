"use client";
import type React from "react";
import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { MessagesSquare, Target, FileText, Sparkles } from "lucide-react";
import { Button, useEnrichment } from "@/components/ds";
import { useIsMobile } from "@/hooks/useIsMobile";

interface DashboardHero {
  id: string;
  title: string;
  description: string;
  insightType: string;
  actionSuggestion: string | null;
}

interface DashboardData {
  greetingName: string;
  kpis: { conversations: number; opportunities: number; contents: number; insightsNew: number };
  queue: { pendingConversations: number; newInsights: number; suggestedContents: number };
  hero: DashboardHero | null;
  recentConversations: { id: string; title: string; date: string }[];
  pipeline: { id: string; title: string; status: string; score: number }[];
  themes: { name: string; count: number; delta: number }[];
  lastProject: { id: string; title: string; description: string | null } | null;
  weekSummary: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const KIND_LABEL: Record<string, string> = {
  pattern: "Padrão",
  connection: "Conexão",
  trend: "Tendência",
  suggestion: "Sugestão",
  opportunity: "Oportunidade real",
};

const OPP_STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  analise: "Em análise",
  qualificada: "Qualificada",
  descartada: "Descartada",
};

const capsStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-muted-foreground)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  margin: "0 0 8px",
};

const hairline = "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)";

const seeAllStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-brand)",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const mutedText: React.CSSProperties = { fontSize: 13, color: "var(--color-muted-foreground)", margin: 0 };

const formatConvDate = (date: string) => {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const scoreColor = (score: number) =>
  score >= 80 ? "var(--badge-green, #248A3D)" : score >= 50 ? "var(--badge-orange, #B25000)" : "var(--color-muted-foreground)";

const ResumoPage = () => {
  const router = useRouter();
  const enrichment = useEnrichment();
  const isMobile = useIsMobile();
  const [creating, setCreating] = useState(false);

  const { data: resp, isLoading } = useSWR<{ data: DashboardData }>("/api/dashboard", fetcher, {
    revalidateOnFocus: false,
  });
  const data = resp?.data;

  const now = new Date();
  const dashDate = now
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
  const hour = now.getHours();
  const salutation = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const greeting =
    salutation +
    (data?.greetingName ? ", " + data.greetingName : "") +
    " — aqui está o que suas conversas revelaram.";

  const openHero = () => {
    if (!data?.hero) return;
    enrichment?.openEnrichment("insight", data.hero.id, {
      title: data.hero.title,
      originalText: data.hero.description,
    });
  };

  const handleCreateProject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const hero = data?.hero;
    if (!hero || creating) return;
    setCreating(true);
    try {
      const existing = await fetch(
        `/api/projects?sourceType=insight&sourceId=${encodeURIComponent(hero.id)}&limit=1`
      );
      if (existing.ok) {
        const ex = await existing.json();
        const found = ex?.data?.[0];
        if (found?.id) {
          router.push("/projetos/" + found.id);
          return;
        }
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: hero.title,
          description: hero.description,
          sourceType: "insight",
          sourceId: hero.id,
        }),
      });
      const body = await res.json();
      const id = body?.data?.id;
      if (id) router.push("/projetos/" + id);
    } catch (err) {
      console.error("Failed to create project from hero insight:", err);
    } finally {
      setCreating(false);
    }
  };

  const kpiCards = [
    { label: "Conversas Processadas", value: data?.kpis.conversations ?? 0, Icon: MessagesSquare, href: "/conversas" },
    { label: "Oportunidades", value: data?.kpis.opportunities ?? 0, Icon: Target, href: "/oportunidades" },
    { label: "Conteúdos Sugeridos", value: data?.kpis.contents ?? 0, Icon: FileText, href: "/conteudos" },
    { label: "Insights Cruzados", value: data?.kpis.insightsNew ?? 0, Icon: Sparkles, href: "/ia-insights" },
  ];

  const queueItems = data
    ? [
        {
          key: "conversas",
          count: data.queue.pendingConversations,
          label:
            data.queue.pendingConversations === 1
              ? "1 conversa aguardando processamento"
              : `${data.queue.pendingConversations} conversas aguardando processamento`,
          cta: "Processar",
          href: "/conversas",
        },
        {
          key: "insights",
          count: data.queue.newInsights,
          label:
            data.queue.newInsights === 1
              ? "1 insight novo não lido"
              : `${data.queue.newInsights} insights novos não lidos`,
          cta: "Revisar",
          href: "/ia-insights",
        },
        {
          key: "conteudos",
          count: data.queue.suggestedContents,
          label:
            data.queue.suggestedContents === 1
              ? "1 conteúdo aguardando aprovação"
              : `${data.queue.suggestedContents} conteúdos aguardando aprovação`,
          cta: "Aprovar",
          href: "/conteudos",
        },
      ].filter((item) => item.count > 0)
    : [];

  const kpiGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
    gap: isMobile ? 10 : 16,
    marginBottom: 32,
  };

  const mainGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)",
    gap: isMobile ? 16 : 24,
    alignItems: "start",
  };

  const columnStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: isMobile ? 16 : 24,
  };

  const header = (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--color-muted-foreground)",
          marginBottom: 2,
        }}
      >
        {dashDate}
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.022em", margin: 0 }}>
        Resumo
      </h1>
      <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginTop: 4, marginBottom: 0 }}>
        {greeting}
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <div style={kpiGridStyle}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ padding: 20 }}>
              <div className="ds-skeleton" style={{ height: 12, width: "60%", borderRadius: 6, marginBottom: 14 }} />
              <div className="ds-skeleton" style={{ height: 24, width: "36%", borderRadius: 6 }} />
            </div>
          ))}
        </div>
        <div style={mainGridStyle}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="ds-card" style={{ padding: 20 }}>
              <div className="ds-skeleton" style={{ height: 14, width: "42%", borderRadius: 6, marginBottom: 16 }} />
              <div className="ds-skeleton" style={{ height: 11, width: "88%", borderRadius: 6, marginBottom: 10 }} />
              <div className="ds-skeleton" style={{ height: 11, width: "76%", borderRadius: 6, marginBottom: 10 }} />
              <div className="ds-skeleton" style={{ height: 11, width: "82%", borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      {data?.hero ? (
        <div
          className="ds-card"
          onClick={openHero}
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            cursor: "pointer",
            marginBottom: 24,
          }}
        >
          <span style={capsStyle}>
            Destaque do dia · {KIND_LABEL[data.hero.insightType] || "Insight"}
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.022em", margin: 0 }}>
            {data.hero.title}
          </h2>
          {data.hero.description ? (
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-muted-foreground)", maxWidth: 720, margin: 0 }}>
              {data.hero.description}
            </p>
          ) : null}
          {data.hero.actionSuggestion ? (
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-brand)", margin: 0 }}>
              Ação sugerida: {data.hero.actionSuggestion}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Button
              variant="primary"
              disabled={creating}
              onClick={handleCreateProject}
              style={{ height: 36, padding: "0 18px", fontSize: 13, fontWeight: 600 }}
            >
              {creating ? "Criando…" : "Criar Projeto"}
            </Button>
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                openHero();
              }}
              style={{ height: 36, padding: "0 18px", fontSize: 13, fontWeight: 600 }}
            >
              Ver insight
            </Button>
          </div>
        </div>
      ) : null}

      <div style={kpiGridStyle}>
        {kpiCards.map(({ label, value, Icon, href }) => (
          <div
            key={href}
            className="ds-card"
            onClick={() => router.push(href)}
            style={{ padding: 20, cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>{label}</span>
              <Icon size={17} strokeWidth={1.75} aria-hidden style={{ opacity: 0.6 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.022em", color: "var(--color-brand)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={mainGridStyle}>
        {/* Coluna esquerda */}
        <div style={columnStyle}>
          <div className="ds-card" style={{ padding: 20 }}>
            <h2 style={cardTitleStyle}>Fila de trabalho</h2>
            {queueItems.length ? (
              queueItems.map((item, i) => (
                <div
                  key={item.key}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: i < queueItems.length - 1 ? hairline : "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      minWidth: 26,
                      height: 26,
                      borderRadius: 999,
                      background: "rgba(120,120,128,0.14)",
                      color: "var(--color-brand)",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.count}
                  </span>
                  <span style={{ fontSize: 13, flex: 1 }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-brand)", whiteSpace: "nowrap" }}>
                    {item.cta} ›
                  </span>
                </div>
              ))
            ) : (
              <p style={mutedText}>Tudo em dia — nenhuma pendência.</p>
            )}
          </div>

          {data?.weekSummary ? (
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 style={cardTitleStyle}>Resumo da semana</h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-foreground)", margin: 0 }}>
                {data.weekSummary}
              </p>
            </div>
          ) : null}

          <div className="ds-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ ...cardTitleStyle, margin: 0 }}>Conversas recentes</h2>
              <button type="button" style={seeAllStyle} onClick={() => router.push("/conversas")}>
                Ver Todas ›
              </button>
            </div>
            {data?.recentConversations.length ? (
              data.recentConversations.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() => router.push("/conversas")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderBottom: i < data.recentConversations.length - 1 ? hairline : "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>
                    {formatConvDate(c.date)}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ ...mutedText, marginTop: 8 }}>Nenhuma conversa ainda.</p>
            )}
          </div>
        </div>

        {/* Coluna direita */}
        <div style={columnStyle}>
          {data?.themes.length ? (
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 style={cardTitleStyle}>Temas em ascensão</h2>
              {data.themes.map((t) => (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.name}
                  </span>
                  {t.delta > 0 ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--badge-green, #248A3D)" }}>
                      ↑ {t.delta} {t.delta === 1 ? "menção" : "menções"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted-foreground)" }}>
                      — estável
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="ds-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ ...cardTitleStyle, margin: 0 }}>Pipeline de oportunidades</h2>
              <button type="button" style={seeAllStyle} onClick={() => router.push("/oportunidades")}>
                Ver Todas ›
              </button>
            </div>
            {data?.pipeline.length ? (
              data.pipeline.map((o, i) => (
                <div
                  key={o.id}
                  onClick={() => router.push("/oportunidades")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderBottom: i < data.pipeline.length - 1 ? hairline : "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.title}
                  </span>
                  <span
                    className="ds-badge ds-badge--compact"
                    style={{
                      background: `var(--opp-${o.status}-bg, var(--badge-bg))`,
                      color: `var(--opp-${o.status}-fg, var(--badge-gray))`,
                      flexShrink: 0,
                    }}
                  >
                    {OPP_STATUS_LABEL[o.status] || o.status}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(o.score), whiteSpace: "nowrap" }}>
                    {Math.round(o.score)}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ ...mutedText, marginTop: 8 }}>Nenhuma oportunidade no pipeline.</p>
            )}
          </div>

          {data?.lastProject ? (
            <div
              className="ds-card"
              onClick={() => router.push("/projetos/" + data.lastProject!.id)}
              style={{ padding: 20, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}
            >
              <span style={capsStyle}>Continuar</span>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
                {data.lastProject.title}
              </h2>
              {data.lastProject.description ? (
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--color-muted-foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {data.lastProject.description}
                </span>
              ) : null}
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-brand)" }}>Abrir kanban ›</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ResumoPage;
