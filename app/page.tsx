"use client";
import type React from "react";
import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { StatCard, InsightCard, Button, Icon, ScoreBadge } from "@/components/ds";

interface Conversation {
  id: string;
  title: string;
  date: string;
  type: string;
  status: string;
}

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  score: number;
  type: string;
  status: string;
}

interface CrossInsight {
  id: string;
  title: string;
  description: string;
  insightType: string;
  confidence: number;
  actionSuggestion: string | null;
  status: string;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const secTitle: React.CSSProperties = { font: "400 20px/24px var(--fontFamily)" };

const DashboardPage = () => {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const { data: conversationsData } = useSWR<{ data: Conversation[]; total: number }>(
    "/api/conversations?limit=5",
    fetcher
  );
  const { data: opportunitiesData } = useSWR<{ data: Opportunity[]; total: number }>(
    "/api/opportunities?limit=5",
    fetcher
  );
  const { data: contentsData } = useSWR<{ data: unknown[]; total: number }>("/api/contents?limit=1", fetcher);
  const { data: insightsData, mutate: mutateInsights } = useSWR<{ data: CrossInsight[] }>(
    "/api/insights?limit=3&status=new",
    fetcher
  );

  const conversations = conversationsData?.data || [];
  const opportunities = opportunitiesData?.data || [];
  const insights = insightsData?.data || [];

  const stats = {
    conversations: conversationsData?.total || 0,
    opportunities: opportunitiesData?.total || 0,
    contents: contentsData?.total || 0,
    insights: insights.length,
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/insights/analyze", { method: "POST" });
      if (!res.ok) {
        // Surface the backend's reason instead of silently doing nothing
        // (e.g. "Need at least 2 processed conversations", rate limit).
        const body = await res.json().catch(() => null);
        setAnalyzeError(body?.error || `Falha ao gerar insights (HTTP ${res.status}).`);
        return;
      }
      await mutateInsights();
    } catch (error) {
      console.error("Failed to analyze insights:", error);
      setAnalyzeError("Não foi possível gerar insights. Verifique a conexão e tente novamente.");
    } finally {
      setAnalyzing(false);
    }
  };

  const patchInsight = async (id: string, status: string) => {
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      mutateInsights();
    } catch (error) {
      console.error("Failed to update insight:", error);
    }
  };

  const linkAll = (path: string) => (
    <a
      href={"/" + path}
      onClick={(e) => {
        e.preventDefault();
        router.push("/" + path);
      }}
      style={{ font: "400 14px/20px var(--font-sans)", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--textLink)" }}
    >
      Ver todas <Icon name="chevron-right" size={16} />
    </a>
  );

  return (
    <div>
      <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: "0 0 20px" }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 24, marginBottom: 32 }}>
        <StatCard title="Conversas Processadas" value={stats.conversations} icon="message-square" onClick={() => router.push("/conversas")} />
        <StatCard title="Oportunidades" value={stats.opportunities} icon="lightbulb" onClick={() => router.push("/oportunidades")} />
        <StatCard title="Conteúdos Sugeridos" value={stats.contents} icon="file-text" onClick={() => router.push("/conteudos")} />
        <StatCard title="Insights Cruzados" value={stats.insights} icon="sparkles" onClick={() => {}} />
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={20} color="var(--color-primary)" />
            <h2 style={secTitle}>Você Sabia?</h2>
          </div>
          <Button variant="outline" size="sm" icon="refresh-cw" iconSpin={analyzing} onClick={handleAnalyze} disabled={analyzing || stats.conversations < 2}>
            {analyzing ? "Analisando..." : "Gerar Insights"}
          </Button>
        </div>
        {analyzeError ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "var(--color-destructive-subtle, #fef2f2)",
              border: "1px solid var(--color-destructive, #f5b5b5)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-destructive-foreground, #b91c1c)",
              font: "400 13px/18px var(--font-sans)",
            }}
          >
            {analyzeError}
          </div>
        ) : null}
        {insights.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
            {insights.map((i) => (
              <InsightCard
                key={i.id}
                title={i.title}
                description={i.description}
                insightType={i.insightType}
                actionSuggestion={i.actionSuggestion || undefined}
                isNew={i.status === "new"}
                onDismiss={() => patchInsight(i.id, "ignored")}
                onMarkUseful={() => patchInsight(i.id, "useful")}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: 32,
              background: "var(--color-sidebar)",
              border: "2px dashed var(--color-border)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
            }}
          >
            <Icon name="sparkles" size={32} color="var(--color-muted-foreground)" />
            <p style={{ margin: "8px 0 0", color: "var(--color-muted-foreground)" }}>
              {stats.conversations < 2
                ? "Adicione mais conversas para gerar insights cruzados."
                : 'Clique em "Gerar Insights" para descobrir conexões entre suas conversas!'}
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={secTitle}>Conversas Recentes</h2>
            {linkAll("conversas")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {conversations.length ? (
              conversations.slice(0, 4).map((c) => (
                <a
                  key={c.id}
                  href="/conversas"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/conversas");
                  }}
                  className="mini-card"
                >
                  <span
                    style={{
                      font: "500 14px/20px var(--font-sans)",
                      color: "var(--color-foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title}
                  </span>
                  <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>
                    {new Date(/^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date + "T12:00:00" : c.date).toLocaleDateString("pt-BR")}
                  </span>
                </a>
              ))
            ) : (
              <div
                style={{
                  padding: 32,
                  background: "var(--color-sidebar)",
                  border: "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  textAlign: "center",
                }}
              >
                <Icon name="message-square" size={32} color="var(--color-muted-foreground)" />
                <p style={{ margin: "8px 0 0", color: "var(--color-muted-foreground)" }}>Nenhuma conversa ainda.</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={secTitle}>Oportunidades em Destaque</h2>
            {linkAll("oportunidades")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {opportunities.length ? (
              opportunities.slice(0, 3).map((o) => (
                <a
                  key={o.id}
                  href="/oportunidades"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/oportunidades");
                  }}
                  className="mini-card"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ font: "500 14px/20px var(--font-sans)", color: "var(--color-foreground)" }}>{o.title}</span>
                    <ScoreBadge score={o.score} />
                  </span>
                  <span
                    style={{
                      font: "400 14px/20px var(--font-sans)",
                      color: "var(--color-muted-foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.pain}
                  </span>
                </a>
              ))
            ) : (
              <div
                style={{
                  padding: 32,
                  background: "var(--color-sidebar)",
                  border: "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  textAlign: "center",
                }}
              >
                <Icon name="lightbulb" size={32} color="var(--color-muted-foreground)" />
                <p style={{ margin: "8px 0 0", color: "var(--color-muted-foreground)" }}>Nenhuma oportunidade detectada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
