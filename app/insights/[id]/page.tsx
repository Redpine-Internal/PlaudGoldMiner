"use client";
import { use, useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button, StartProjectButton } from "@/components/ds";

interface InsightDetail {
  id: string;
  title: string;
  description: string;
  pattern: string;
  insightType: string;
  confidence: number;
  status: string;
  actionSuggestion: string | null;
  createdAt: string;
  frequency?: number | null;
  analyzedCount?: number | null;
  evidence?: { conversationId: string; excerpt: string }[];
  businessType?: string | null;
  methodology?: string | null;
  isHypothesis?: boolean;
  notes?: string | null;
  conversationTitle?: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BT_LABEL: Record<string, string> = { treinamento: "Treinamento", consultoria: "Consultoria", sistema: "Sistema" };
const ST_LABEL: Record<string, string> = { new: "Novo", useful: "Aprovado", dismissed: "Descartado", archived: "Arquivado" };

export default function InsightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, mutate } = useSWR<{ data: InsightDetail }>(`/api/insights/${id}`, fetcher, {
    revalidateOnFocus: false,
  });
  const insight = data?.data;

  const setStatus = async (status: string) => {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutate();
  };

  // Anotações da Andresa (D12) — editáveis e salvas via PATCH { notes }.
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => {
    setNotesDraft(insight?.notes ?? "");
  }, [insight?.notes]);
  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      await mutate();
    } finally {
      setSavingNotes(false);
    }
  };

  if (isLoading) return <div className="ds-card" style={{ height: 240 }} />;
  if (error || !insight) return <div style={{ padding: 16 }}>Insight não encontrado.</div>;

  const evidence = insight.evidence ?? [];

  return (
    <div style={{ maxWidth: 860 }}>
      <Link href="/insights" style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
        ← Voltar para insights
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px", flexWrap: "wrap" }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>{insight.title}</h1>
        {insight.businessType ? (
          <span className="ds-badge" style={{ background: `var(--opp-${insight.businessType}-bg)`, color: `var(--opp-${insight.businessType}-fg)` }}>
            {BT_LABEL[insight.businessType] ?? insight.businessType}
          </span>
        ) : null}
        <span className="ds-badge">{ST_LABEL[insight.status] ?? insight.status}</span>
      </div>
      <p style={{ font: "500 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)", margin: "0 0 16px" }}>
        📊 {insight.pattern} · Confiança {Math.round(insight.confidence * 100)}%
      </p>
      <p style={{ font: "400 15px/22px var(--font-sans)", margin: "0 0 16px" }}>{insight.description}</p>

      {insight.actionSuggestion ? (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <strong style={{ font: "500 13px/18px var(--font-sans)" }}>💡 Próxima ação sugerida</strong>
          <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>{insight.actionSuggestion}</p>
        </div>
      ) : null}

      {insight.methodology ? (
        <div className="ds-card" style={{ marginBottom: 16, borderLeft: "3px solid var(--color-primary)" }}>
          <strong style={{ font: "500 13px/18px var(--font-sans)", color: "var(--color-primary)" }}>
            🧪 Hipótese de metodologia (proposta da IA, requer sua aprovação)
          </strong>
          <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-sans)" }}>{insight.methodology}</p>
        </div>
      ) : null}

      <h2 style={{ font: "400 18px/24px var(--fontFamily)", margin: "24px 0 8px" }}>
        Evidências ({evidence.length})
      </h2>
      {evidence.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {evidence.map((ev, i) => (
            <div key={i} className="ds-card">
              <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", fontStyle: "italic" }}>&ldquo;{ev.excerpt}&rdquo;</p>
              <Link
                href={`/conversas?open=${ev.conversationId}`}
                style={{ font: "500 12px/16px var(--font-sans)", color: "var(--color-primary)" }}
              >
                Ver conversa de origem →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)", marginBottom: 24 }}>
          Este insight foi gerado antes do registro de evidências. Gere novos insights para obter trechos-fonte.
        </p>
      )}

      <h2 style={{ font: "400 18px/24px var(--fontFamily)", margin: "24px 0 8px" }}>Minhas anotações</h2>
      <div className="ds-card" style={{ marginBottom: 24 }}>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Anote decisões, contexto ou próximos passos deste insight..."
          rows={4}
          style={{ width: "100%", boxSizing: "border-box", font: "400 14px/20px var(--font-sans)", background: "transparent", color: "inherit", border: "1px solid var(--color-border)", borderRadius: 5, padding: 8, resize: "vertical" }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={saveNotes}
          disabled={savingNotes || notesDraft === (insight.notes ?? "")}
          style={{ marginTop: 8 }}
        >
          {savingNotes ? "Salvando..." : "Salvar anotações"}
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {insight.status !== "useful" ? (
          <Button variant="primary" onClick={() => setStatus("useful")}>Aprovar</Button>
        ) : null}
        {insight.status !== "dismissed" ? (
          <Button variant="outline" onClick={() => setStatus("dismissed")}>Descartar</Button>
        ) : null}
        {insight.status !== "archived" ? (
          <Button variant="outline" onClick={() => setStatus("archived")}>Arquivar</Button>
        ) : null}
        <StartProjectButton sourceType="insight" sourceId={insight.id} title={insight.title} description={insight.description} />
      </div>
    </div>
  );
}
