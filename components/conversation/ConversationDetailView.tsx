"use client";
import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Icon, Tabs, TypeBadge, StatusBadge, EmptyState, Button, ScoreBadge, Markdown } from "@/components/ds";
import type { ConversationAiAnalysis } from "@/lib/ai/conversation-analysis-store";
import { formatOpportunityStatus, formatOpportunityType } from "@/lib/presentation/labels";

interface ConversationDetail {
  id: string;
  title: string;
  date: string;
  duration: string | null;
  type: "reuniao" | "treinamento" | "informal" | "outro";
  status: "processado" | "pendente" | "processando" | "erro";
  summary: string | null;
  transcription: string | null;
  topics: string | null;
  participants: string | null;
  tags: string | null;
  audioUrl?: string | null;
  source: string;
  localConversationId?: string | null;
  aiAnalysis?: ConversationAiAnalysis | null;
}

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  type: string;
  score: number;
  status: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Tab = "resumo" | "analise" | "transcricao" | "insights";

const h4: React.CSSProperties = { font: "500 15px/22px var(--font-sans)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 };
const chip: React.CSSProperties = {
  padding: "4px 8px",
  font: "400 12px/16px var(--font-sans)",
  borderRadius: 5,
  background: "var(--color-muted)",
  color: "var(--color-muted-foreground)",
};

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const isPlaudId = (id: string) => /^[0-9a-f]{32}$/i.test(id);

export function ConversationDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("resumo");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const plaud = isPlaudId(id);

  const { data: conversationData, isLoading, mutate: mutateConversation } = useSWR<{ data: ConversationDetail }>(
    plaud ? `/api/plaud/files/${id}` : `/api/conversations/${id}`,
    fetcher
  );
  const opportunityConversationId = plaud ? conversationData?.data.localConversationId : id;
  const { data: opportunitiesData } = useSWR<{ data: Opportunity[] }>(
    opportunityConversationId ? `/api/conversations/${opportunityConversationId}/opportunities` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const analyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/plaud/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Falha ao analisar a conversa.");
      }
      await mutateConversation((current) => current ? {
        data: {
          ...current.data,
          localConversationId: json.data.conversationId,
          aiAnalysis: json.data.aiAnalysis,
        },
      } : current, { revalidate: false });
      setTab("analise");
      setAnalyzing(false);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Falha ao analisar a conversa.");
      setAnalyzing(false);
    }
  };

  const backLink = (
    <Button variant="outline" icon="arrow-left" iconSize={16} onClick={() => router.push("/conversas")}>
      Voltar
    </Button>
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 12 }}>
        <Icon name="reload" size={32} className="ds-spin" color="var(--color-muted-foreground)" />
        <p style={{ font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>Carregando conversa...</p>
      </div>
    );
  }

  const c = conversationData?.data;
  const opps = opportunitiesData?.data || [];

  if (!c) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>{backLink}</div>
        <EmptyState icon="x" title="Conversa não encontrada" message="Não foi possível carregar os detalhes desta conversa." />
      </div>
    );
  }

  const participants = parseList(c.participants);
  const topics = parseList(c.topics);
  const tags = parseList(c.tags);
  const status = c.status === "processando" ? "pendente" : c.status;
  const fmtDate = (ds: string) => new Date(ds).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ marginBottom: 16 }}>{backLink}</div>

      {/* Header */}
      <div style={{ paddingBottom: 20, marginBottom: 20 }}>
        <h1 style={{ font: "400 28px/34px var(--fontFamily)", margin: "0 0 12px" }}>{c.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <TypeBadge type={c.type} />
          <StatusBadge status={status} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="calendar" size={14} />
            {fmtDate(c.date)}
          </span>
          {c.duration ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="clock" size={14} />
              {c.duration}
            </span>
          ) : null}
        </div>
        {c.audioUrl ? (
          <audio controls preload="none" style={{ width: "100%", maxWidth: 560, height: 48, marginTop: 16 }}>
            {/* Plaud serves the recording as MP3 (S3 presigned). */}
            <source src={c.audioUrl} type="audio/mpeg" />
            Seu navegador não suporta reprodução de áudio.
          </audio>
        ) : null}
        {/* Bridge: turn a real Plaud recording into local opportunities. Only for
            Plaud conversations that already have a transcription to analyze. */}
        {plaud && c.transcription && !c.aiAnalysis ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <Button icon={analyzing ? "reload" : "sparkles"} iconSpin={analyzing} disabled={analyzing} onClick={analyze} style={{ alignSelf: "flex-start" }}>
              {analyzing ? "Analisando..." : "Analisar conversa"}
            </Button>
            {analyzeError ? (
              <span style={{ font: "400 13px/18px var(--font-sans)", color: "var(--accent-error)" }}>{analyzeError}</span>
            ) : (
              <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                Gera uma análise própria e novos negócios sem substituir o resumo original do Plaud.
              </span>
            )}
          </div>
        ) : null}
      </div>

      <Tabs
        idBase="conversation-detail"
        aria-label="Conteúdo da conversa"
        tabs={[
          { id: "resumo", label: plaud ? "Resumo do Plaud" : "Resumo" },
          ...(c.aiAnalysis ? [{ id: "analise", label: "Análise da IA" }] : []),
          { id: "transcricao", label: "Transcrição" },
          { id: "insights", label: "Negócios" },
        ]}
        style={{ overflowX: "auto" }}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      <div
        id={`conversation-detail-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`conversation-detail-tab-${tab}`}
        tabIndex={0}
        style={{ paddingTop: 24 }}
      >
        {tab === "resumo" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <h4 style={h4}>Resumo</h4>
              {c.summary ? (
                <Markdown>{c.summary}</Markdown>
              ) : (
                <p style={{ margin: 0, font: "400 14px/22px var(--font-sans)", color: "var(--color-muted-foreground)", fontStyle: "italic" }}>
                  Resumo ainda não disponível — esta gravação ainda não foi processada no Plaud.
                </p>
              )}
            </div>
            {participants.length ? (
              <div>
                <h4 style={h4}>
                  <Icon name="user" size={16} />
                  Participantes
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {participants.map((p) => (
                    <span key={p} style={chip}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {topics.length ? (
              <div>
                <h4 style={h4}>
                  <Icon name="tag" size={16} />
                  Tópicos
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {topics.slice(0, 15).map((t) => (
                    <span key={t} style={{ ...chip, background: "var(--brand)", color: "var(--app-on-ink)" }}>
                      {t}
                    </span>
                  ))}
                  {topics.length > 15 ? <span style={chip}>+{topics.length - 15}</span> : null}
                </div>
              </div>
            ) : null}
            {tags.length ? (
              <div>
                <h4 style={h4}>Tags</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {tags.map((t) => (
                    <span key={t} style={{ ...chip, background: "var(--type-reuniao-bg)", color: "var(--type-reuniao-fg)" }}>
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {opps.length ? (
              <div>
                <h4 style={h4}>
                  <Icon name="lightbulb" size={16} />
                  Novos Negócios ({opps.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {opps.slice(0, 3).map((o) => (
                    <div
                      key={o.id}
                      style={{ padding: 14, background: "color-mix(in srgb, var(--color-muted) 50%, transparent)", borderRadius: "var(--radius-lg)" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ font: "500 14px/20px var(--font-sans)" }}>{o.title}</span>
                        <ScoreBadge score={o.score} />
                      </div>
                      <p style={{ margin: "4px 0 0", font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{o.pain}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === "analise" && c.aiAnalysis ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <h4 style={h4}>
                <Icon name="sparkles" size={16} />
                Análise da IA
              </h4>
              <Markdown>{c.aiAnalysis.summary}</Markdown>
            </div>
            {c.aiAnalysis.problems.length ? (
              <div>
                <h4 style={h4}>Problemas e dores identificados</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {c.aiAnalysis.problems.map((problem, index) => (
                    <div
                      key={`${problem.description}-${index}`}
                      style={{ padding: 14, background: "color-mix(in srgb, var(--color-muted) 50%, transparent)", borderRadius: "var(--radius-lg)" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <span style={{ font: "500 14px/20px var(--font-sans)" }}>{problem.description}</span>
                        <span style={chip}>Severidade {problem.severity}</span>
                      </div>
                      <p style={{ margin: "4px 0 0", font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                        {problem.mentions} {problem.mentions === 1 ? "menção" : "menções"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {c.aiAnalysis.topics.length ? (
              <div>
                <h4 style={h4}>Tópicos identificados pela IA</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {c.aiAnalysis.topics.map((topic) => <span key={topic} style={chip}>{topic}</span>)}
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === "transcricao" ? (
          c.transcription ? (
            <p style={{ margin: 0, font: "400 16px/26px var(--font-text)", color: "var(--color-foreground)", whiteSpace: "pre-wrap" }}>
              {c.transcription}
            </p>
          ) : (
            <EmptyState icon="file-text" title="Transcrição não disponível" message="A transcrição desta conversa ainda não foi processada." />
          )
        ) : opps.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h4 style={{ ...h4, marginBottom: 0 }}>Novos Negócios Detectados ({opps.length})</h4>
            {opps.map((o) => (
              <div
                key={o.id}
                style={{ padding: 16, background: "color-mix(in srgb, var(--color-muted) 50%, transparent)", borderRadius: "var(--radius-lg)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <span style={{ font: "500 16px/24px var(--font-sans)" }}>{o.title}</span>
                  <ScoreBadge score={o.score} />
                </div>
                <p style={{ margin: "0 0 8px", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{o.pain}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ ...chip, background: "var(--brand)", color: "var(--app-on-ink)" }}>{formatOpportunityType(o.type)}</span>
                  <span style={chip}>{formatOpportunityStatus(o.status)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="lightbulb" title="Nenhum negócio detectado" message="Não foram detectados novos negócios nesta conversa." />
        )}
      </div>
    </div>
  );
}
