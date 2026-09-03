"use client";
import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { UploadModal } from "@/components/upload";
import { DriveImportModal } from "@/components/drive";
import { SyncPlaudButton } from "@/components/SyncPlaudButton";
import { Button, SearchInput, FilterChip, EmptyState, Icon, Pagination, Skeleton, TypeBadge, StatusBadge } from "@/components/ds";
import { GlassList, GlassListRow, GlassListSection } from "@/components/lg/GlassList";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";

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

// Busca insensível a acentos: "seguranca" deve casar com "Segurança".
function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

const parseDate = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T12:00:00" : s);
const fmtDate = (s: string) => parseDate(s).toLocaleDateString("pt-BR");

// Agrupamento por data, fiel ao protótipo: Hoje / Esta Semana / Este Mês / Anteriores.
const GROUP_LABELS = ["Hoje", "Esta Semana", "Este Mês", "Anteriores"] as const;
function groupIndex(dateStr: string, now: Date): number {
  const diff = (now.getTime() - parseDate(dateStr).getTime()) / 86400000;
  return diff < 1 ? 0 : diff <= 7 ? 1 : diff <= 31 ? 2 : 3;
}

// Filtros de UI persistidos (a busca `q` segue a URL, não o storage).
type ConvFilters = {
  types: string[];
  period: string;
  content: (keyof ContentFlags)[];
};
const INITIAL_FILTERS: ConvFilters = { types: [], period: "all", content: [] };

const filterLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--color-muted-foreground)",
  marginBottom: 8,
};

const ConversasView = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  // Busca global: a toolbar navega para /conversas?q=... — o ?q= é o valor
  // inicial E reativo do filtro de busca; edição local não altera a URL.
  const [q, setQ] = useState(urlQ);
  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);

  const [f, setF] = usePersistedFilters<ConvFilters>("conversas", INITIAL_FILTERS);
  const { types, period, content } = f;
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
        const s = fold(q);
        if (!fold(c.title).includes(s) && !fold(c.summary || "").includes(s)) return false;
      }
      if (types.length && !types.includes(c.type)) return false;
      if (from || to) {
        const d = parseDate(c.date);
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
  const statusTargets = contentActive ? baseList : paged;

  // Grupos de data da página atual (grupos vazios somem).
  const groups = useMemo(() => {
    const now = new Date();
    const buckets: ApiConversation[][] = [[], [], [], []];
    paged.forEach((c) => buckets[groupIndex(c.date, now)].push(c));
    return GROUP_LABELS.map((label, i) => ({ label, rows: buckets[i] })).filter((g) => g.rows.length > 0);
  }, [paged]);

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

  // Resolve os três campos de conteúdo nas linhas visíveis. Quando um filtro de
  // conteúdo está ativo, todas as candidatas precisam ser verificadas antes de
  // sabermos quais permanecem na lista. A fila limita a concorrência do Plaud.
  useEffect(() => {
    let cancelled = false;
    statusTargets.forEach((c) => {
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
  }, [contentActive, statusTargets]);

  const toggleType = (t: string) => setF({ types: types.includes(t) ? types.filter((x) => x !== t) : [...types, t] });
  const toggleContent = (k: keyof ContentFlags) =>
    setF({ content: content.includes(k) ? content.filter((x) => x !== k) : [...content, k] });
  const hasFilters = Boolean(q || types.length || period !== "all" || content.length);
  const clearFilters = () => {
    setQ("");
    setF(INITIAL_FILTERS);
  };

  return (
    <div className="pgm-conversations-page">
      <header className="pgm-page-intro">
        <p className="pgm-page-eyebrow">Biblioteca de evidências · Plaud (principal) · Drive (alternativa)</p>
        <h1>Conversas</h1>
      </header>
      <div className="pgm-command-bar">
        <Button variant="secondary" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={() => mutate()} />
        <SyncPlaudButton onDone={() => mutate()} />
        <Button variant="secondary" icon="hard-drive" onClick={() => setDriveOpen(true)}>
          Importar do Drive
        </Button>
        <Button icon="plus" onClick={() => setUploadOpen(true)}>
          Nova Conversa
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por título ou resumo" style={{ flex: 1, maxWidth: 264, minWidth: 160 }} />
          <FilterChip
            active={showFilters || types.length > 0 || content.length > 0}
            onClick={() => setShowFilters(!showFilters)}
            count={types.length + content.length || undefined}
            aria-expanded={showFilters}
            aria-controls="conversation-filters"
          >
            Filtros
          </FilterChip>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="ds-btn ds-btn--link"
              style={{ color: "var(--color-muted-foreground)" }}
            >
              Limpar filtros
            </button>
          ) : null}
          <span style={{ marginLeft: "auto", fontSize: 15, color: "var(--color-muted-foreground)" }}>
            {list.length} conversa{list.length !== 1 ? "s" : ""}
            {pendingCount ? ` · verificando ${pendingCount}…` : ""}
          </span>
        </div>
        {showFilters ? (
          <div
            id="conversation-filters"
            style={{
              padding: 16,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-card)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <div style={filterLabelStyle}>Tipo de Conversa</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TYPES.map(([v, l]) => (
                  <FilterChip key={v} active={types.includes(v)} onClick={() => toggleType(v)}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <div style={filterLabelStyle}>Período</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PERIODS.map(([v, l]) => (
                  <FilterChip key={v} active={period === v} onClick={() => setF({ period: v })}>
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <div style={filterLabelStyle}>Conteúdo</div>
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

      {isLoading ? (
        <GlassList>
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassListRow key={i}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton style={{ height: 14, width: "45%", borderRadius: 6 }} />
                <Skeleton style={{ height: 12, width: "70%", borderRadius: 6 }} />
              </div>
              <Skeleton style={{ height: 12, width: 64, borderRadius: 6, flexShrink: 0 }} />
            </GlassListRow>
          ))}
        </GlassList>
      ) : list.length ? (
        <>
          {isMobile ? null : (
            <div className="pgm-conversations-columns" aria-hidden="true">
              <span>Título</span>
              <span>Tipo</span>
              <span>Status</span>
              <span>Data</span>
              <span>Duração</span>
              <span>Conteúdo</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {groups.map((g) => (
              <div key={g.label} style={{ minWidth: 0 }}>
                <GlassListSection>{g.label}</GlassListSection>
                <GlassList>
                  {g.rows.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      status={statusById[c.id]}
                      isMobile={isMobile}
                      onSelect={() => router.push(`/conversas/${c.id}`)}
                    />
                  ))}
                </GlassList>
              </div>
            ))}
          </div>
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

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={() => mutate()} />
      <DriveImportModal isOpen={driveOpen} onClose={() => setDriveOpen(false)} onSuccess={() => mutate()} />
    </div>
  );
};

/**
 * Linha da lista de conversas dentro do vidro único (GlassListRow).
 * Título 16px 600 + badges de tipo/status; resumo em 1 linha; data/duração na
 * coluna direita no desktop e inline no mobile (sem colunas extras). Os badges
 * de conteúdo (resumo/transcrição/insights) aparecem só com filtro de conteúdo
 * ativo, alimentados pelo fetch central rate-limited da página.
 */
function ConversationRow({
  conversation: c,
  status,
  isMobile,
  onSelect,
}: {
  conversation: ApiConversation;
  status: CardStatus | undefined;
  isMobile: boolean;
  onSelect: () => void;
}) {
  const flags = status && status !== "loading" ? status : null;
  const dateFmt = fmtDate(c.date);
  const displayStatus = c.status === "processando" ? "pendente" : c.status;

  if (!isMobile) {
    return (
      <GlassListRow className="pgm-conversation-row" onClick={onSelect} hideChevron aria-label={c.title}>
        <span className="pgm-conversation-row__title">{c.title}</span>
        <TypeBadge type={c.type} />
        <StatusBadge status={displayStatus} />
        <span className="pgm-conversation-row__muted">{dateFmt}</span>
        <span className="pgm-conversation-row__muted">{c.duration || "—"}</span>
        <div className="pgm-conversation-row__content">
          <IndicatorBadge icon="file-text" label="Resumo" shortLabel="RES" on={flags?.hasSummary} loading={!flags} />
          <IndicatorBadge icon="documents" label="Transcrição" shortLabel="TRA" on={flags?.hasTranscription} loading={!flags} />
          <IndicatorBadge icon="lightbulb" label="Insights" shortLabel="INS" on={flags?.hasInsights} loading={!flags} />
        </div>
      </GlassListRow>
    );
  }

  return (
    <GlassListRow onClick={onSelect} aria-label={c.title}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.title}
          </span>
          <TypeBadge type={c.type} style={{ flexShrink: 0 }} />
          <StatusBadge status={displayStatus} style={{ flexShrink: 0 }} />
        </div>
        {c.summary ? (
          <span
            style={{
              fontSize: 15,
              color: "var(--color-muted-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.summary}
          </span>
        ) : null}
        {isMobile ? (
          <span style={{ fontSize: 14, color: "var(--color-muted-foreground)" }}>
            {dateFmt}
            {c.duration ? ` · ${c.duration}` : ""}
          </span>
        ) : null}
        {status ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            <IndicatorBadge icon="file-text" label="Resumo" on={flags?.hasSummary} loading={!flags} />
            <IndicatorBadge icon="documents" label="Transcrição" on={flags?.hasTranscription} loading={!flags} />
            <IndicatorBadge icon="lightbulb" label="Insights" on={flags?.hasInsights} loading={!flags} />
          </div>
        ) : null}
      </div>
      {!isMobile ? (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <span style={{ fontSize: 14, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>{dateFmt}</span>
          {c.duration ? (
            <span style={{ fontSize: 14, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>{c.duration}</span>
          ) : null}
        </div>
      ) : null}
    </GlassListRow>
  );
}

/** Cápsula neutra indicando se um conteúdo existe (texto verde semântico) ou não (muted). */
function IndicatorBadge({ icon, label, shortLabel, on, loading }: { icon: string; label: string; shortLabel?: string; on?: boolean; loading?: boolean }) {
  const active = Boolean(on) && !loading;
  return (
    <span
      title={loading ? `${label}: verificando...` : on ? `Tem ${label.toLowerCase()}` : `Sem ${label.toLowerCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 5,
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: "16px",
        background: "var(--badge-bg, var(--color-muted))",
        color: active ? "var(--badge-green)" : "var(--color-muted-foreground)",
        opacity: loading ? 0.5 : 1,
      }}
    >
      <Icon name={loading ? "reload" : active ? "check" : icon} size={13} className={loading ? "ds-spin" : undefined} />
      {shortLabel || label}
    </span>
  );
}

// Next 16: useSearchParams em client component exige um boundary de <Suspense>
// no prerender — o miolo (ConversasView) é quem lê a URL.
const ConversasPage = () => (
  <Suspense fallback={null}>
    <ConversasView />
  </Suspense>
);

export default ConversasPage;
