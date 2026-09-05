"use client";
import { Suspense, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { UploadModal } from "@/components/upload";
import { DriveImportModal } from "@/components/drive";
import { SyncPlaudButton } from "@/components/SyncPlaudButton";
import { Button, SearchInput, FilterChip, EmptyState, Icon, Pagination, Skeleton, TypeBadge, StatusBadge } from "@/components/ds";
import { GlassList, GlassListRow, GlassListSection } from "@/components/lg/GlassList";
import { usePersistedFilters } from "@/components/lg/usePersistedFilters";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CONVERSATION_TYPE_LABELS } from "@/lib/presentation/labels";
import { fetchJson } from "@/lib/http";

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
  source: string;
  sourceFileId: string | null;
  hasSummary: boolean;
  hasTranscription: boolean;
  hasInsights: boolean;
}

interface ApiResponse {
  data: ApiConversation[];
  total: number;
}

const fetcher = fetchJson<ApiResponse>;

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

const TYPES = Object.entries(CONVERSATION_TYPE_LABELS);
const PERIODS: [string, string][] = [
  ["all", "Todos"],
  ["today", "Hoje"],
  ["week", "Esta semana"],
  ["month", "Este mês"],
  ["custom", "Período customizado"],
];

// Content-status flags loaded on-demand per Plaud recording via /status.
type ContentFlags = { hasSummary: boolean; hasTranscription: boolean; hasInsights: boolean };
// The three content filters, keyed to the flag they gate on.
const CONTENT: [keyof ContentFlags, string][] = [
  ["hasSummary", "Resumo"],
  ["hasTranscription", "Transcrição"],
  ["hasInsights", "Negócios"],
];

function getDateRange(period: string, from: string, to: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "today":
      return { from: localDate(today), to: localDate(now) };
    case "week": {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      return { from: localDate(weekStart), to: localDate(now) };
    }
    case "month": {
      return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDate(now) };
    }
    case "custom":
      return { from, to };
    default:
      return { from: "", to: "" };
  }
}

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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
  from: string;
  to: string;
};
const INITIAL_FILTERS: ConvFilters = { types: [], period: "all", content: [], from: "", to: "" };

const filterLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--color-muted-foreground)",
  marginBottom: 8,
};

const ConversasView = ({ initialSearch }: { initialSearch: string }) => {
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const isMobile = useIsMobile();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [source, setSource] = useState<"acervo" | "plaud">("acervo");
  const livePlaud = source === "plaud";
  // Busca global: a toolbar navega para /conversas?q=... — o ?q= é o valor
  // inicial E reativo do filtro de busca; edição local não altera a URL.
  const [q, setQ] = useState(initialSearch);

  const [f, setF] = usePersistedFilters<ConvFilters>("conversas", INITIAL_FILTERS);
  const { types, period, content, from = "", to = "" } = f;
  const [showFilters, setShowFilters] = useState(false);
  const filterKey = JSON.stringify([q, types, period, content, from, to, source]);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (next: number | ((current: number) => number)) => setPagination({ key: filterKey, page: typeof next === "function" ? next(page) : next });
  if (pagination.key !== filterKey) setPagination({ key: filterKey, page: 1 });
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  if (q.trim()) query.set("search", q.trim());
  types.forEach((type) => query.append("type", type));
  content.forEach((flag) => query.append("content", flag));
  const range = getDateRange(period, from, to);
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const invalidRange = !livePlaud && Boolean(range.from && range.to && range.from > range.to);
  const { data, error, isLoading, mutate, isValidating } = useSWR<ApiResponse>(
    invalidRange ? null : livePlaud ? `/api/plaud/files?page=${page}&page_size=${PAGE_SIZE}` : `/api/conversations?${query}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const conversations = useMemo(() => data?.data || [], [data]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Grupos de data da página atual (grupos vazios somem).
  const groups = useMemo(() => {
    const now = new Date();
    const buckets: ApiConversation[][] = [[], [], [], []];
    conversations.forEach((c) => buckets[groupIndex(c.date, now)].push(c));
    return GROUP_LABELS.map((label, i) => ({ label, rows: buckets[i] })).filter((g) => g.rows.length > 0);
  }, [conversations]);

  if (!livePlaud && data && page > pageCount) setPage(pageCount);

  const toggleType = (t: string) => setF({ types: types.includes(t) ? types.filter((x) => x !== t) : [...types, t] });
  const toggleContent = (k: keyof ContentFlags) =>
    setF({ content: content.includes(k) ? content.filter((x) => x !== k) : [...content, k] });
  const hasFilters = Boolean(q || types.length || period !== "all" || content.length);
  const clearFilters = () => {
    setQ("");
    setF(INITIAL_FILTERS);
  };
  const refresh = () => {
    void mutate();
    if (livePlaud) {
      const visibleStatusKeys = new Set(conversations.map((conversation) => `/api/plaud/files/${conversation.id}/status`));
      void mutateCache((key) => typeof key === "string" && visibleStatusKeys.has(key));
    }
  };
  const imported = () => {
    setSource("acervo");
    setPage(1);
    void mutateCache((key) => typeof key === "string" && key.startsWith("/api/conversations?"));
  };

  return (
    <div className="pgm-conversations-page">
      <header className="pgm-page-intro">
        <p className="pgm-page-eyebrow">Biblioteca de evidências · Plaud (principal) · Drive (alternativa)</p>
        <h1>Conversas</h1>
      </header>
      <div className="pgm-command-bar">
        <Button variant="secondary" icon="refresh-cw" iconSpin={isValidating} title="Atualizar lista" onClick={refresh} />
        <SyncPlaudButton onDone={imported} />
        <Button variant="secondary" icon="hard-drive" onClick={() => setDriveOpen(true)}>
          Importar do Drive
        </Button>
        <Button icon="plus" onClick={() => setUploadOpen(true)}>
          Nova Conversa
        </Button>
      </div>

      <div role="group" aria-label="Origem das conversas" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <FilterChip active={!livePlaud} onClick={() => setSource("acervo")}>Acervo</FilterChip>
        <FilterChip active={livePlaud} onClick={() => setSource("plaud")}>Disponíveis no Plaud</FilterChip>
      </div>
      {livePlaud ? <p style={{ color: "var(--color-muted-foreground)", marginBottom: 16 }}>Gravações diretamente do Plaud. Use “Sincronizar com Plaud” para incluí-las no acervo e pesquisar com todos os filtros.</p> : null}

      {!livePlaud ? <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
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
            {total} conversa{total !== 1 ? "s" : ""}
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
              {period === "custom" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                  <label>De <input aria-label="Data inicial" type="date" className="ds-input" value={from} max={to || undefined} onChange={(event) => setF({ from: event.target.value })} /></label>
                  <label>Até <input aria-label="Data final" type="date" className="ds-input" value={to} min={from || undefined} onChange={(event) => setF({ to: event.target.value })} /></label>
                </div>
              ) : null}
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
      </div> : null}

      {invalidRange ? <p role="alert">A data inicial deve ser anterior ou igual à data final.</p> : null}

      {error ? (
        <div role="alert" style={{ padding: 16, marginBottom: 16, background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>
          Erro ao carregar conversas. Por favor, tente novamente.
        </div>
      ) : null}

      {error || invalidRange ? null : isLoading ? (
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
      ) : conversations.length ? (
        <>
          {isMobile ? null : (
            <div className="pgm-conversations-columns" aria-hidden="true">
              <span>Título</span>
              <span>Tipo</span>
              <span>Status</span>
              <span>Data</span>
              <span>Duração</span>
              <span>Disponibilidade</span>
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
                      livePlaud={livePlaud}
                      isMobile={isMobile}
                      onSelect={() => router.push(`/conversas/${c.source === "plaud" && /^[0-9a-f]{32}$/i.test(c.sourceFileId || "") ? c.sourceFileId : c.id}`)}
                    />
                  ))}
                </GlassList>
              </div>
            ))}
          </div>
          {!livePlaud ? <Pagination page={page} pageCount={pageCount} onChange={setPage} /> : null}
        </>
      ) : (
        <EmptyState
          icon="message-square"
          title="Nenhuma conversa encontrada"
          message={
            livePlaud
              ? "Não há gravações nesta página do Plaud. Volte à página anterior ou atualize a lista."
              : hasFilters
              ? "Nenhuma conversa corresponde aos filtros selecionados. Tente ajustar os filtros."
              : "Parece que você ainda não tem nenhuma conversa processada. Faça upload de uma transcrição ou importe do Google Drive para começar."
          }
        />
      )}

      {livePlaud ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
        <Button variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
        <span>Página {page}</span>
        <Button variant="outline" disabled={isLoading || Boolean(error) || conversations.length < PAGE_SIZE} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
      </div> : null}

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={imported} />
      <DriveImportModal isOpen={driveOpen} onClose={() => setDriveOpen(false)} onSuccess={imported} />
    </div>
  );
};

/**
 * Linha da lista de conversas dentro do vidro único (GlassListRow).
 * Título 16px 600 + badges de tipo/status; resumo em 1 linha; data/duração na
 * coluna direita no desktop e inline no mobile (sem colunas extras). Os badges
 * de conteúdo vêm do acervo ou de uma consulta sob demanda na aba Plaud.
 */
function ConversationRow({
  conversation: c,
  livePlaud,
  isMobile,
  onSelect,
}: {
  conversation: ApiConversation;
  livePlaud: boolean;
  isMobile: boolean;
  onSelect: () => void;
}) {
  const { data: status, error: statusError } = useSWR(
    livePlaud ? `/api/plaud/files/${c.id}/status` : null,
    statusFetcher,
    { revalidateOnFocus: false, errorRetryCount: 2 },
  );
  const flags = livePlaud ? status?.data : c;
  const dateFmt = fmtDate(c.date);
  const displayStatus = c.status;
  // The Plaud file list does not classify recordings or report local processing.
  const typeBadge = livePlaud ? <span className="ds-badge">Gravação</span> : <TypeBadge type={c.type} />;
  const statusBadge = livePlaud ? <span className="ds-badge">No Plaud</span> : <StatusBadge status={displayStatus} />;

  if (!isMobile) {
    return (
      <GlassListRow className="pgm-conversation-row" onClick={onSelect} hideChevron aria-label={c.title}>
        <span className="pgm-conversation-row__title">{c.title}</span>
        {typeBadge}
        {statusBadge}
        <span className="pgm-conversation-row__muted">{dateFmt}</span>
        <span className="pgm-conversation-row__muted">{c.duration || "—"}</span>
        <div className="pgm-conversation-row__content">
          <IndicatorBadge icon="file-text" label="Resumo" on={flags?.hasSummary} loading={!flags && !statusError} error={Boolean(statusError)} />
          <IndicatorBadge icon="documents" label="Transcrição" on={flags?.hasTranscription} loading={!flags && !statusError} error={Boolean(statusError)} />
          <IndicatorBadge icon="lightbulb" label="Negócios" on={flags?.hasInsights} loading={!flags && !statusError} error={Boolean(statusError)} />
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
          {typeBadge}
          {statusBadge}
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
        {(
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            <IndicatorBadge icon="file-text" label="Resumo" on={flags?.hasSummary} loading={!flags && !statusError} error={Boolean(statusError)} />
            <IndicatorBadge icon="documents" label="Transcrição" on={flags?.hasTranscription} loading={!flags && !statusError} error={Boolean(statusError)} />
            <IndicatorBadge icon="lightbulb" label="Negócios" on={flags?.hasInsights} loading={!flags && !statusError} error={Boolean(statusError)} />
          </div>
        )}
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

/** Indicador neutro mostrando se cada conteúdo está disponível. */
function IndicatorBadge({ icon, label, on, loading, error }: { icon: string; label: string; on?: boolean; loading?: boolean; error?: boolean }) {
  const active = Boolean(on) && !loading;
  return (
    <span
      title={error ? `${label}: não foi possível verificar. Atualize para tentar novamente.` : loading ? `${label}: verificando...` : on ? `Tem ${label.toLowerCase()}` : `Sem ${label.toLowerCase()}`}
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
      {label}
    </span>
  );
}

// Next 16: useSearchParams em client component exige um boundary de <Suspense>
// no prerender — o miolo (ConversasView) é quem lê a URL.
const ConversasPage = () => (
  <Suspense fallback={null}>
    <ConversasQuery />
  </Suspense>
);

function ConversasQuery() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  return <ConversasView key={q} initialSearch={q} />;
}

export default ConversasPage;
