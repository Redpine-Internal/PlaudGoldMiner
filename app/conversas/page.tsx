"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { UploadModal } from "@/components/upload";
import { DriveImportModal } from "@/components/drive";
import { SyncPlaudButton } from "@/components/SyncPlaudButton";
import { Button, SearchInput, FilterChip, ConversationCard, EmptyState, ConversationCardSkeleton, Icon, Pagination } from "@/components/ds";

const PAGE_SIZE = 20;

interface ApiConversation {
  id: string;
  title: string;
  date: string;
  duration: string | null;
  type: "reuniao" | "treinamento" | "informal" | "outro";
  status: "processado" | "pendente" | "processando" | "erro";
  summary: string | null;
  topics: string | null;
  participants: string | null;
}

interface ApiResponse {
  data: ApiConversation[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Concurrency-limited queue for the per-card /status calls. The Plaud API caps
// at 60 req/min, so firing ~40 requests at once (one per card) self-DDoSes it
// into 429s. We serialize them through a small pool so the fan-out stays polite.
const STATUS_CONCURRENCY = 4;
let activeStatus = 0;
const statusQueue: (() => void)[] = [];
function runNext() {
  if (activeStatus >= STATUS_CONCURRENCY) return;
  const job = statusQueue.shift();
  if (!job) return;
  activeStatus++;
  job();
}
const statusFetcher = (url: string): Promise<{ data: ContentFlags }> =>
  new Promise((resolve, reject) => {
    statusQueue.push(() => {
      fetch(url)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
        .then(resolve, reject)
        .finally(() => {
          activeStatus--;
          runNext();
        });
    });
    runNext();
  });

const TYPES: [string, string][] = [
  ["reuniao", "Reunião"],
  ["treinamento", "Treinamento"],
  ["informal", "Informal"],
  ["outro", "Outro"],
];
const PERIODS: [string, string][] = [
  ["all", "Todos"],
  ["today", "Hoje"],
  ["week", "Esta semana"],
  ["month", "Este mês"],
  ["custom", "Período customizado"],
];

// Content-status flags loaded on-demand per Plaud recording via /status.
type ContentFlags = { hasSummary: boolean; hasTranscription: boolean; hasInsights: boolean };
type CardStatus = ContentFlags | "loading";
// The three content filters, keyed to the flag they gate on.
const CONTENT: [keyof ContentFlags, string][] = [
  ["hasSummary", "Resumo"],
  ["hasTranscription", "Transcrição"],
  ["hasInsights", "Insights"],
];

function getDateRange(period: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "today":
      return { from: today, to: now };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo, to: now };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { from: monthAgo, to: now };
    }
    default:
      return { from: null as Date | null, to: null as Date | null };
  }
}

const ConversasPage = () => {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [period, setPeriod] = useState("all");
  const [content, setContent] = useState<(keyof ContentFlags)[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  // Content flags per card id, filled in progressively as each row fetches its status.
  const [statusById, setStatusById] = useState<Record<string, CardStatus>>({});

  const reportStatus = useCallback((id: string, status: CardStatus) => {
    setStatusById((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }));
  }, []);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    "/api/plaud/files?page=1&page_size=50",
    fetcher,
    { revalidateOnFocus: false }
  );

  const conversations = useMemo(() => data?.data || [], [data]);

  // baseList: everything matching the cheap, local filters (search/type/period).
  // These are the cards whose status we may need to fetch — including ones the
  // content filter will hide, since we can only hide them AFTER their flags load.
  const baseList = useMemo(() => {
    const { from, to } = getDateRange(period);
    return conversations.filter((c) => {
      if (q) {
        const s = q.toLowerCase();
        if (!c.title.toLowerCase().includes(s) && !(c.summary || "").toLowerCase().includes(s)) return false;
      }
      if (types.length && !types.includes(c.type)) return false;
      if (from || to) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date + "T12:00:00" : c.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
  }, [conversations, q, types, period]);

  // list: what actually renders. With a content filter active, a card is kept
  // only once its flags have loaded and match; still-loading cards are held back.
  const contentActive = content.length > 0;
  const list = useMemo(() => {
    if (!contentActive) return baseList;
    return baseList.filter((c) => {
      const st = statusById[c.id];
      if (!st || st === "loading") return false;
      return content.every((k) => st[k]);
    });
  }, [baseList, contentActive, content, statusById]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = useMemo(() => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [list, page]);

  useEffect(() => {
    setPage(1);
  }, [q, types, period, content]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // How many cards are still resolving their status while a filter is active —
  // drives the "verificando…" hint so an empty list doesn't look final.
  const pendingCount = contentActive
    ? baseList.filter((c) => { const s = statusById[c.id]; return !s || s === "loading"; }).length
    : 0;

  // Fetch statuses at the page level (not per-card) so a card the content filter
  // will hide still gets fetched — otherwise it'd never mount to reveal itself.
  // Only runs while a content filter is active; goes through the concurrency
  // queue to stay under Plaud's rate limit.
  useEffect(() => {
    if (!contentActive) return;
    let cancelled = false;
    baseList.forEach((c) => {
      if (statusById[c.id]) return; // already loaded or loading
      reportStatus(c.id, "loading");
      statusFetcher(`/api/plaud/files/${c.id}/status`)
        .then((r) => {
          if (cancelled) return;
          const d = r?.data;
          reportStatus(c.id, {
            hasSummary: Boolean(d?.hasSummary),
            hasTranscription: Boolean(d?.hasTranscription),
            hasInsights: Boolean(d?.hasInsights),
          });
        })
        .catch(() => {
          if (cancelled) return;
          // On failure (e.g. Plaud 429/502) treat all flags as false so the card
          // resolves out of "loading" instead of hanging the filter forever.
          reportStatus(c.id, { hasSummary: false, hasTranscription: false, hasInsights: false });
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentActive, baseList]);

  const toggleType = (t: string) => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const toggleContent = (k: keyof ContentFlags) => setContent((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const hasFilters = q || types.length || period !== "all" || content.length;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 8 }}>
        <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: 0 }}>Conversas</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="outline" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
          <SyncPlaudButton onDone={() => mutate()} />
          <Button variant="outline" icon="hard-drive" onClick={() => setDriveOpen(true)}>
            Importar do Drive
          </Button>
          <Button icon="plus" onClick={() => setUploadOpen(true)}>
            Nova Conversa
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por título ou resumo..." style={{ flex: 1, maxWidth: 448, minWidth: 160 }} />
          <FilterChip active={showFilters || types.length > 0 || content.length > 0} onClick={() => setShowFilters(!showFilters)} count={types.length + content.length || undefined}>
            Filtros
          </FilterChip>
          {hasFilters ? (
            <button
              className="ds-btn ds-btn--link"
              style={{ color: "var(--color-muted-foreground)" }}
              onClick={() => {
                setQ("");
                setTypes([]);
                setPeriod("all");
                setContent([]);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>
            {list.length} conversa{list.length !== 1 ? "s" : ""}
            {pendingCount ? ` · verificando ${pendingCount}…` : ""}
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
                Tipo de Conversa
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TYPES.map(([v, l]) => (
                  <FilterChip key={v} active={types.includes(v)} onClick={() => toggleType(v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <label className="ds-label" style={{ marginBottom: 8 }}>
                Período
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PERIODS.map(([v, l]) => (
                  <FilterChip key={v} active={period === v} onClick={() => setPeriod(v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <label className="ds-label" style={{ marginBottom: 8 }}>
                Conteúdo
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CONTENT.map(([k, l]) => (
                  <FilterChip key={k} active={content.includes(k)} onClick={() => toggleContent(k)}>
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
          Erro ao carregar conversas. Por favor, tente novamente.
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <ConversationCardSkeleton key={i} />)
        ) : list.length ? (
          <>
            {paged.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                status={statusById[c.id]}
                onSelect={() => router.push(`/conversas/${c.id}`)}
              />
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon="message-square"
            title="Nenhuma conversa encontrada"
            message={
              conversations.length
                ? "Nenhuma conversa corresponde aos filtros selecionados. Tente ajustar os filtros."
                : "Parece que você ainda não tem nenhuma conversa processada. Faça upload de uma transcrição ou importe do Google Drive para começar."
            }
          />
        )}
      </div>

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={() => mutate()} />
      <DriveImportModal isOpen={driveOpen} onClose={() => setDriveOpen(false)} onSuccess={() => mutate()} />
    </div>
  );
};

/**
 * A single conversation row. Purely presentational: it receives its already-
 * fetched content-status from the page (fetched centrally, rate-limited, only
 * while a content filter is active) and renders the resumo/transcrição/insights
 * indicator badges. When no status is present (no filter active) it shows no
 * badges, keeping the default list clean and fast.
 */
function ConversationRow({
  conversation: c,
  status,
  onSelect,
}: {
  conversation: ApiConversation;
  status: CardStatus | undefined;
  onSelect: () => void;
}) {
  const flags = status && status !== "loading" ? status : null;
  const badges = status ? (
    <>
      <IndicatorBadge icon="file-text" label="Resumo" on={flags?.hasSummary} loading={!flags} />
      <IndicatorBadge icon="documents" label="Transcrição" on={flags?.hasTranscription} loading={!flags} />
      <IndicatorBadge icon="lightbulb" label="Insights" on={flags?.hasInsights} loading={!flags} />
    </>
  ) : null;

  return (
    <ConversationCard
      title={c.title}
      date={c.date}
      duration={c.duration || undefined}
      type={c.type}
      status={c.status === "processando" ? "pendente" : c.status}
      summary={c.summary || undefined}
      onSelect={onSelect}
      badges={badges}
    />
  );
}

/** Small pill showing whether a piece of content is present (green) or absent (muted). */
function IndicatorBadge({ icon, label, on, loading }: { icon: string; label: string; on?: boolean; loading?: boolean }) {
  const active = Boolean(on) && !loading;
  return (
    <span
      title={loading ? `${label}: verificando...` : on ? `Tem ${label.toLowerCase()}` : `Sem ${label.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        font: "500 11px/16px var(--font-sans)",
        background: active ? "var(--type-treinamento-bg, var(--color-muted))" : "var(--color-muted)",
        color: active ? "var(--type-treinamento-fg, var(--color-foreground))" : "var(--color-muted-foreground)",
        opacity: loading ? 0.5 : 1,
      }}
    >
      <Icon name={loading ? "reload" : active ? "check" : icon} size={11} className={loading ? "ds-spin" : undefined} />
      {label}
    </span>
  );
}

export default ConversasPage;
