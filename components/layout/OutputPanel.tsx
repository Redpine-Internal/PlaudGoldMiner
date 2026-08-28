"use client";
import type React from "react";
import { useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/stores/appStore";
import { Icon, Tabs, TypeBadge, StatusBadge, EmptyState, Button, ScoreBadge, Markdown } from "@/components/ds";

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

type Tab = "resumo" | "transcricao" | "insights";

const ASIDE: React.CSSProperties = {
  width: 400,
  flexShrink: 0,
  background: "var(--color-sidebar)",
  borderLeft: "1px solid var(--color-border)",
  display: "flex",
  flexDirection: "column",
};

const h4: React.CSSProperties = { font: "500 14px/20px var(--font-sans)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 };
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

const OutputPanel = () => {
  const { selectedConversationId, setSelectedConversationId } = useAppStore();
  const [tab, setTab] = useState<Tab>("resumo");

  // Plaud recording ids are 32-hex; seed conversations use `conv-N`.
  const isPlaud = !!selectedConversationId && /^[0-9a-f]{32}$/i.test(selectedConversationId);

  const { data: conversationData, isLoading } = useSWR<{ data: ConversationDetail }>(
    selectedConversationId
      ? isPlaud
        ? `/api/plaud/files/${selectedConversationId}`
        : `/api/conversations/${selectedConversationId}`
      : null,
    fetcher
  );
  // Opportunities only exist for locally-processed (seed) conversations, not live Plaud reads.
  const { data: opportunitiesData } = useSWR<{ data: Opportunity[] }>(
    selectedConversationId && !isPlaud
      ? `/api/conversations/${selectedConversationId}/opportunities`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <aside className="output-panel" style={{ ...ASIDE, alignItems: "center", justifyContent: "center" }}>
        <Icon name="reload" size={32} className="ds-spin" color="var(--color-muted-foreground)" />
        <p style={{ marginTop: 8, font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>Carregando...</p>
      </aside>
    );
  }

  const c = conversationData?.data;
  const opps = opportunitiesData?.data || [];

  if (!c) {
    return (
      <aside className="output-panel" style={{ ...ASIDE, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <EmptyState icon="x" title="Erro" message="Detalhes não encontrados para a conversa selecionada." />
      </aside>
    );
  }

  const participants = parseList(c.participants);
  const topics = parseList(c.topics);
  const tags = parseList(c.tags);
  const status = c.status === "processando" ? "pendente" : c.status;

  const fmtDate = (ds: string) =>
    new Date(ds).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <aside className="output-panel" style={ASIDE}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <h2 style={{ font: "400 20px/28px var(--fontFamily)", paddingRight: 32 }}>{c.title}</h2>
          <button onClick={() => setSelectedConversationId(null)} className="icon-btn">
            <Icon name="x" size={20} color="var(--color-muted-foreground)" />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <TypeBadge type={c.type} />
          <StatusBadge status={status} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="calendar" size={12} />
            {fmtDate(c.date)}
          </span>
          {c.duration ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="clock" size={12} />
              {c.duration}
            </span>
          ) : null}
        </div>
        {c.audioUrl ? (
          <audio controls preload="none" style={{ width: "100%", height: 36, marginTop: 12 }}>
            {/* Plaud serve the recording as MP3 (S3 presigned, content-type generic). */}
            <source src={c.audioUrl} type="audio/mpeg" />
            Seu navegador não suporta reprodução de áudio.
          </audio>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { id: "resumo", label: "Resumo" },
          { id: "transcricao", label: "Transcrição" },
          { id: "insights", label: "Insights" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "resumo" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                    <span key={t} style={{ ...chip, background: "var(--brand)", color: "var(--textButtonPrimary)" }}>
                      {t}
                    </span>
                  ))}
                  {topics.length > 15 ? (
                    <span style={{ ...chip }}>+{topics.length - 15}</span>
                  ) : null}
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
                  Oportunidades ({opps.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {opps.slice(0, 3).map((o) => (
                    <div
                      key={o.id}
                      style={{
                        padding: 12,
                        background: "color-mix(in srgb, var(--color-muted) 50%, transparent)",
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ font: "500 14px/20px var(--font-sans)" }}>{o.title}</span>
                        <ScoreBadge score={o.score} />
                      </div>
                      <p style={{ margin: "4px 0 0", font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{o.pain}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === "transcricao" ? (
          c.transcription ? (
            <p style={{ margin: 0, font: "400 14px/22px var(--font-sans)", color: "var(--color-muted-foreground)", whiteSpace: "pre-wrap" }}>
              {c.transcription}
            </p>
          ) : (
            <EmptyState icon="file-text" title="Transcrição não disponível" message="A transcrição desta conversa ainda não foi processada." />
          )
        ) : opps.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h4 style={{ ...h4, marginBottom: 0 }}>Oportunidades Detectadas ({opps.length})</h4>
            {opps.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: 16,
                  background: "color-mix(in srgb, var(--color-muted) 50%, transparent)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <span style={{ font: "500 16px/24px var(--font-sans)" }}>{o.title}</span>
                  <ScoreBadge score={o.score} />
                </div>
                <p style={{ margin: "0 0 8px", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{o.pain}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ ...chip, background: "var(--brand)", color: "var(--textButtonPrimary)" }}>{o.type}</span>
                  <span style={chip}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="lightbulb" title="Nenhum insight disponível" message="Não foram detectadas oportunidades nesta conversa." />
        )}
      </div>

      <div style={{ padding: 16, borderTop: "1px solid var(--color-border)" }}>
        <Button variant="outline" icon="square-pen" iconSize={16} style={{ width: "100%" }}>
          Editar Metadados
        </Button>
      </div>
    </aside>
  );
};

export default OutputPanel;
