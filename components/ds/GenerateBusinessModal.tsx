"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { SearchInput } from "./SearchInput";

/**
 * Seleção do range de reuniões que alimenta a geração de Novos Negócios.
 *
 * Três modos, conforme o pedido do produto: por período, por seleção manual, ou
 * a partir de uma única conversa. O modo "pendentes" mantém o comportamento
 * antigo do botão (conversas ainda não analisadas) para quem só quer um clique.
 */

export type GenerateMode = "pending" | "period" | "selection" | "single";

export interface GeneratePayload {
  mode: GenerateMode;
  from?: string;
  to?: string;
  conversationIds?: string[];
  conversationId?: string;
}

interface ConversationOption {
  id: string;
  title: string | null;
  date: string | null;
  status: string;
}

interface Props {
  onClose: () => void;
  onGenerate: (payload: GeneratePayload) => void;
  busy?: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const MAX_SELECTION = 40;

const MODES: { value: GenerateMode; label: string; hint: string }[] = [
  { value: "pending", label: "Pendentes", hint: "Conversas processadas que ainda não geraram negócios." },
  { value: "period", label: "Por período", hint: "Todas as reuniões entre duas datas, analisadas em conjunto." },
  { value: "selection", label: "Seleção manual", hint: "Escolha exatamente quais reuniões entram na análise." },
  { value: "single", label: "Uma conversa", hint: "Analisa uma única reunião." },
];

function fmtDate(d: string | null): string {
  if (!d) return "sem data";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function GenerateBusinessModal({ onClose, onGenerate, busy = false }: Props) {
  const [mode, setMode] = useState<GenerateMode>("pending");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  // A lista só é necessária nos modos que escolhem conversa a dedo.
  const needsList = mode === "selection" || mode === "single";
  const { data, isLoading } = useSWR<{ data: ConversationOption[] }>(
    // O limite da rota é capado em 100 — pedir mais devolve 400.
    needsList ? "/api/conversations?limit=100&status=processado" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const conversations = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => (c.title || "").toLowerCase().includes(term));
  }, [conversations, q]);

  useEffect(() => {
    // Trocar de modo não deve carregar seleção do modo anterior.
    setPicked([]);
    setQ("");
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) => {
    if (mode === "single") {
      setPicked((prev) => (prev[0] === id ? [] : [id]));
      return;
    }
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, id];
    });
  };

  const invalid =
    (mode === "period" && (!from || !to || from > to)) ||
    (mode === "selection" && !picked.length) ||
    (mode === "single" && !picked.length);

  const submit = () => {
    if (invalid || busy) return;
    if (mode === "period") onGenerate({ mode, from, to });
    else if (mode === "selection") onGenerate({ mode, conversationIds: picked });
    else if (mode === "single") onGenerate({ mode, conversationId: picked[0] });
    else onGenerate({ mode: "pending" });
  };

  const hint = MODES.find((m) => m.value === mode)?.hint ?? "";

  return (
    <div
      className="ds-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        className="ds-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detectar novos negócios"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(max(50vw, 640px), 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ font: "400 20px/28px var(--fontFamily)", margin: 0 }}>Detectar Negócios</h2>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="ds-btn ds-btn--secondary"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              style={{
                cursor: "pointer",
                background: mode === m.value ? "rgba(120,120,128,0.24)" : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p style={{ margin: 0, font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
          {hint}
        </p>

        {mode === "period" ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="ds-label">De</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="ds-input"
                style={{ padding: "8px 10px" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="ds-label">Até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="ds-input"
                style={{ padding: "8px 10px" }}
              />
            </label>
          </div>
        ) : null}

        {needsList ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar reunião..." />
            <div
              style={{
                overflowY: "auto",
                maxHeight: "40vh",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              {isLoading ? (
                <p style={{ padding: 12, margin: 0, color: "var(--color-muted-foreground)" }}>Carregando…</p>
              ) : filtered.length ? (
                filtered.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "8px 12px",
                        background: on ? "rgba(120,120,128,0.2)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        textAlign: "left",
                        font: "400 13px/18px var(--font-sans)",
                        color: "var(--textPrimary)",
                      }}
                    >
                      <span style={{ width: 16, flexShrink: 0 }}>{on ? <Icon name="check" size={14} /> : null}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title || "Sem título"}
                      </span>
                      <span style={{ color: "var(--color-muted-foreground)", flexShrink: 0 }}>{fmtDate(c.date)}</span>
                    </button>
                  );
                })
              ) : (
                <p style={{ padding: 12, margin: 0, color: "var(--color-muted-foreground)" }}>
                  Nenhuma conversa processada encontrada.
                </p>
              )}
            </div>
            {mode === "selection" ? (
              <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                {picked.length} de no máximo {MAX_SELECTION} selecionada(s)
              </span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="sparkles" iconSpin={busy} onClick={submit} disabled={busy || invalid}>
            {busy ? "Detectando..." : "Detectar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
