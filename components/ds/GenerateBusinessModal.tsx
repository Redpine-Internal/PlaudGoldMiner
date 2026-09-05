"use client";
import { useId, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { Icon } from "@/components/ds/Icon";
import { Pagination } from "@/components/ds/Pagination";
import { SearchInput } from "@/components/ds/SearchInput";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { fetchJson } from "@/lib/http";
import { formatCalendarDate } from "@/lib/presentation/calendar-date";

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

const MAX_SELECTION = 40;
const PAGE_SIZE = 20;

interface ConversationPage {
  data: ConversationOption[];
  total: number;
  limit: number;
  offset: number;
}

export function conversationSelectionUrl(page: number, query: string): string {
  const params = new URLSearchParams({
    status: "processado",
    content: "hasTranscription",
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  if (query.trim()) params.set("search", query.trim());
  return `/api/conversations?${params}`;
}

export function toggleConversationSelection(picked: string[], id: string, single: boolean): string[] {
  if (single) return picked[0] === id ? [] : [id];
  if (picked.includes(id)) return picked.filter((value) => value !== id);
  return picked.length < MAX_SELECTION ? [...picked, id] : picked;
}

const MODES: { value: GenerateMode; label: string; hint: string }[] = [
  { value: "pending", label: "Pendentes", hint: "Conversas processadas que ainda não geraram negócios." },
  { value: "period", label: "Por período", hint: "Todas as reuniões entre duas datas, analisadas em conjunto." },
  { value: "selection", label: "Seleção manual", hint: "Escolha exatamente quais reuniões entram na análise." },
  { value: "single", label: "Uma conversa", hint: "Analisa uma única reunião." },
];

function fmtDate(d: string | null): string {
  return formatCalendarDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function GenerateBusinessModal({ onClose, onGenerate, busy = false }: Props) {
  const [mode, setMode] = useState<GenerateMode>("pending");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const titleId = useId();
  const dialogRef = useModalDialog({ isOpen: true, onClose, canClose: !busy });

  // A lista só é necessária nos modos que escolhem conversa a dedo.
  const needsList = mode === "selection" || mode === "single";
  const { data, error, isLoading, isValidating, mutate } = useSWR<ConversationPage>(
    needsList ? conversationSelectionUrl(page, q) : null,
    fetchJson,
    {
      revalidateOnFocus: false,
      onSuccess: (result) => {
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        setPage((current) => Math.min(current, lastPage));
      },
    }
  );

  const conversations = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (id: string) => {
    if (!busy) setPicked((prev) => toggleConversationSelection(prev, id, mode === "single"));
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
      onClick={busy ? undefined : onClose}
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
        ref={dialogRef}
        className="ds-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-hint`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(max(50vw, 640px), 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id={titleId} style={{ font: "400 20px/28px var(--fontFamily)", margin: 0 }}>Detectar Negócios</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Fechar"
            aria-label="Fechar seleção de conversas"
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
              disabled={busy}
              onClick={() => {
                if (mode === m.value) return;
                setMode(m.value);
                setPicked([]);
                setQ("");
                setPage(1);
              }}
              style={{
                cursor: "pointer",
                background: mode === m.value ? "rgba(120,120,128,0.24)" : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p id={`${titleId}-hint`} style={{ margin: 0, font: "400 13px/18px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
          {hint}
        </p>

        {mode === "period" ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="ds-label">De</span>
              <input
                type="date"
                value={from}
                disabled={busy}
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
                disabled={busy}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="ds-input"
                style={{ padding: "8px 10px" }}
              />
            </label>
          </div>
        ) : null}

        {needsList ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <SearchInput
              value={q}
              onChange={(value) => { if (!busy) { setQ(value); setPage(1); } }}
              placeholder="Buscar reunião..."
              aria-label="Buscar em todas as conversas processadas"
              disabled={busy}
            />
            <div
              style={{
                overflowY: "auto",
                maxHeight: "40vh",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              {error ? (
                <div role="alert" style={{ padding: 12 }}>
                  <p>{error instanceof Error ? error.message : "Não foi possível carregar as conversas."}</p>
                  <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isValidating || busy}>
                    {isValidating ? "Tentando…" : "Tentar novamente"}
                  </Button>
                </div>
              ) : isLoading ? (
                <p role="status" style={{ padding: 12, margin: 0, color: "var(--color-muted-foreground)" }}>Carregando…</p>
              ) : conversations.length ? (
                conversations.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      aria-pressed={on}
                      disabled={busy || (!on && mode === "selection" && picked.length >= MAX_SELECTION)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        minHeight: 48,
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
                      <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 4, overflowWrap: "anywhere" }}>
                        <span>{c.title || "Sem título"}</span>
                        <span style={{ color: "var(--color-muted-foreground)" }}>{fmtDate(c.date)}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p style={{ padding: 12, margin: 0, color: "var(--color-muted-foreground)" }}>
                  {q ? "Nenhuma conversa encontrada para esta busca." : "Nenhuma conversa processada com transcrição disponível."}
                </p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span role="status" style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
                {mode === "selection"
                  ? `${picked.length} de no máximo ${MAX_SELECTION} selecionada(s)`
                  : `${picked.length} conversa selecionada`}
                {data && !error ? ` · ${total} encontrada(s)` : ""}
              </span>
              {picked.length ? <Button variant="link" size="sm" onClick={() => setPicked([])} disabled={busy}>Limpar seleção</Button> : null}
            </div>
            {!error ? <Pagination page={page} pageCount={pageCount} onChange={(value) => { if (!busy) setPage(value); }} style={{ marginTop: 4, flexWrap: "wrap" }} /> : null}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
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
