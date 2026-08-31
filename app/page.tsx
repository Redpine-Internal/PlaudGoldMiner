"use client";
import type React from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { MessagesSquare, Target, FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useContainerWidth } from "@/hooks/useContainerWidth";

interface DashboardData {
  greetingName: string;
  kpis: { conversations: number; opportunities: number; contents: number };
  queue: { pendingConversations: number; suggestedContents: number };
  recentConversations: { id: string; title: string; date: string }[];
  pipeline: { id: string; title: string; status: string; score: number }[];
  themes: { name: string; count: number; delta: number }[];
  demand: {
    type: string;
    count: number;
    conversations: number;
    avgScore: number;
    topTitle: string | null;
    share: number;
  }[];
  volume: { month: string; label: string; year: number; total: number }[];
  volumeMax: number;
  volumeTotal: number;
  evidence: {
    buckets: { sources: number; opportunities: number }[];
    total: number;
    max: number;
    avgSources: number;
    single: number;
  };
  coverage: { analyzed: number; total: number; percent: number };
  lastProject: { id: string; title: string; description: string | null } | null;
  weekSummary: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const OPP_STATUS_LABEL: Record<string, string> = {
  nova: "Nova",
  analise: "Em análise",
  qualificada: "Qualificada",
  descartada: "Descartada",
};

const OPP_TYPE_LABEL: Record<string, string> = {
  treinamento: "Treinamento",
  consultoria: "Consultoria",
  sistema: "Sistema",
  produto: "Produto",
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

// Largura máxima da coluna de leitura. Acima disso o conteúdo para de esticar e
// passa a centralizar: num monitor de 1920px o card de 12 colunas viraria uma
// faixa de ~1700px com barras de 24px perdidas em vãos enormes.
const CONTENT_MAX = 1180;

// Limiares medidos NO CONTAINER, não na janela. Abaixo de 720px de conteúdo as
// duas colunas do grid principal ficam com ~340px e os títulos dos cards passam
// a quebrar; abaixo de 480px nem os três KPIs lado a lado cabem.
const TWO_COL_MIN = 720;
const KPI_ROW_MIN = 480;

const ResumoPage = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [contentRef, contentWidth] = useContainerWidth<HTMLDivElement>();

  // 0 = ainda não medido (primeiro paint / SSR): assume estreito, que é o
  // layout que nunca estoura. O ResizeObserver corrige no frame seguinte.
  const measured = contentWidth > 0;
  const twoCol = measured && contentWidth >= TWO_COL_MIN;
  const kpiRow = !measured || contentWidth >= KPI_ROW_MIN;

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

  const kpiCards = [
    { label: "Conversas Processadas", value: data?.kpis.conversations ?? 0, Icon: MessagesSquare, href: "/conversas" },
    { label: "Novos Negócios", value: data?.kpis.opportunities ?? 0, Icon: Target, href: "/novos-negocios" },
    { label: "Conteúdos Sugeridos", value: data?.kpis.contents ?? 0, Icon: FileText, href: "/conteudos" },
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

  // Três KPIs numa linha só. O grid de 2 colunas do mobile antigo deixava o
  // terceiro card órfão, com um buraco do lado — três colunas estreitas leem
  // melhor que duas e meia.
  const kpiGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: kpiRow ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)",
    gap: isMobile ? 10 : 16,
    marginBottom: 32,
  };

  const mainGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: twoCol ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
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

  // A <main> da AppShell não limita largura, então o conteúdo esticava até a
  // borda da janela. O ref mede a largura REAL disponível — é ela, e não a da
  // janela, que decide o número de colunas.
  const shellStyle: React.CSSProperties = { maxWidth: CONTENT_MAX, margin: "0 auto" };

  if (isLoading) {
    return (
      <div ref={contentRef} style={shellStyle}>
        {header}
        <div style={kpiGridStyle}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="ds-card"
              style={{
                padding: kpiRow ? 20 : "14px 16px",
                // Espelha o card real: em linha quando empilhado, para o
                // esqueleto não ter altura diferente do que vai substituí-lo.
                display: kpiRow ? "block" : "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                className="ds-skeleton"
                style={{ height: 12, width: kpiRow ? "60%" : 120, borderRadius: 6, marginBottom: kpiRow ? 14 : 0 }}
              />
              <div className="ds-skeleton" style={{ height: 24, width: kpiRow ? "36%" : 44, borderRadius: 6 }} />
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
    <div ref={contentRef} style={shellStyle}>
      {header}

      <div style={kpiGridStyle}>
        {kpiCards.map(({ label, value, Icon, href }) => (
          <div
            key={href}
            className="ds-card"
            onClick={() => router.push(href)}
            style={{
              padding: kpiRow ? 20 : "14px 16px",
              cursor: "pointer",
              // Empilhado (tela estreita) o card vira uma linha: rótulo à
              // esquerda, número à direita. Em coluna, um card de 265px de
              // altura para um número só empurrava o gráfico para fora da tela.
              display: kpiRow ? "block" : "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* Empilhado em linha o rótulo não precisa de altura reservada.
                Em três colunas, "Conversas Processadas" quebra em duas linhas e
                as outras não — sem o minHeight só esse número descia 19px. */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: kpiRow ? 12 : 0,
                minHeight: kpiRow ? 36 : undefined,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1.35, color: "var(--color-muted-foreground)" }}>{label}</span>
              {kpiRow ? <Icon size={17} strokeWidth={1.75} aria-hidden style={{ opacity: 0.6, flexShrink: 0 }} /> : null}
            </div>
            <div
              style={{
                fontSize: kpiRow ? 28 : 24,
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.022em",
                color: "var(--color-brand)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Volume de conversas por mês — série temporal de uma série só, então
          coluna com hue sequencial e nenhuma legenda: o título já diz o que é. */}
      {data?.volume.length ? (
        <div className="ds-card" style={{ padding: 20, marginBottom: isMobile ? 16 : 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ ...cardTitleStyle, margin: 0 }}>Conversas por mês</h2>
            <span style={{ ...mutedText, fontSize: 12 }}>
              {data.volumeTotal} nos últimos 12 meses
            </span>
          </div>
          <p style={{ ...mutedText, fontSize: 12, margin: "0 0 16px" }}>
            O acervo que alimenta a análise. Meses sem conversa aparecem como zero.
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 132 }}>
            {data.volume.map((v) => {
              const isMax = v.total === data.volumeMax && v.total > 0;
              const h = data.volumeMax > 0 ? (v.total / data.volumeMax) * 100 : 0;
              return (
                <div
                  key={v.month}
                  title={`${v.label}/${String(v.year).slice(2)} — ${v.total} ${v.total === 1 ? "conversa" : "conversas"}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    height: "100%",
                    gap: 4,
                  }}
                >
                  {/* Rótulo só no extremo — um número em cada coluna vira ruído. */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1,
                      color: isMax ? "var(--color-foreground)" : "transparent",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {v.total}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 24,
                      height: `${Math.max(h, v.total > 0 ? 3 : 1)}%`,
                      minHeight: v.total > 0 ? 3 : 1,
                      // Extremidade de dados arredondada, base quadrada.
                      borderRadius: "4px 4px 0 0",
                      background: v.total > 0
                        ? isMax
                          ? "var(--chart-seq-3)"
                          : "var(--chart-seq-2)"
                        : "var(--chart-track)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          {/* Eixo x: hairline sólido, recessivo. */}
          <div style={{ height: 1, background: "var(--chart-grid)", margin: "6px 0 6px" }} />
          <div style={{ display: "flex", gap: 2 }}>
            {data.volume.map((v, i) => (
              <span
                key={v.month}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "center",
                  fontSize: 10,
                  letterSpacing: "0.02em",
                  color: "var(--color-muted-foreground)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Abaixo de ~32px por rótulo os meses se tocam; alterna um sim,
                    um não — contando de trás pra frente, para que o mês mais
                    recente nunca seja o omitido. Mede o container, não a janela:
                    o gráfico também aperta numa janela larga com sidebar. */}
                {measured &&
                contentWidth / data.volume.length < 32 &&
                (data.volume.length - 1 - i) % 2 === 1
                  ? ""
                  : v.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
          {data?.demand.length ? (
            <div className="ds-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ ...cardTitleStyle, margin: 0 }}>Demanda por tipo de serviço</h2>
                <button type="button" style={seeAllStyle} onClick={() => router.push("/novos-negocios")}>
                  Ver Todas ›
                </button>
              </div>
              <p style={{ ...mutedText, fontSize: 12, margin: "0 0 4px" }}>
                Conversas que sustentam cada tipo de negócio.
              </p>
              {data.demand.map((d, i) => (
                <div
                  key={d.type}
                  onClick={() => router.push("/novos-negocios")}
                  style={{ padding: "10px 0", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                      {OPP_TYPE_LABEL[d.type] || d.type}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>
                      {d.count} {d.count === 1 ? "negócio" : "negócios"} · {d.conversations}{" "}
                      {d.conversations === 1 ? "conversa" : "conversas"}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: scoreColor(d.avgScore),
                        whiteSpace: "nowrap",
                        minWidth: 24,
                        textAlign: "right",
                      }}
                    >
                      {d.avgScore}
                    </span>
                  </div>
                  {/* Barra proporcional ao nº de conversas — comparação visual
                      sem depender de lib de gráfico. A trilha ocupa a linha
                      inteira: com o rótulo ao lado, cada linha tinha uma trilha
                      de comprimento diferente (o texto varia de largura) e as
                      barras deixavam de ser comparáveis entre si. */}
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: "rgba(120,120,128,0.14)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(d.share, 2)}%`,
                        height: "100%",
                        borderRadius: 999,
                        // Paleta categórica dedicada, em ordem fixa. Os tokens
                        // --opp-*-fg repetem cor entre tipos (consultoria =
                        // sistema, treinamento = produto) e sairiam iguais aqui.
                        background: `var(--chart-cat-${(i % 4) + 1})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Evidência por negócio: a distribuição prova que as oportunidades
              nascem de um conjunto de conversas, não de uma reunião isolada. */}
          {data?.evidence.total ? (
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 style={{ ...cardTitleStyle, margin: 0 }}>Evidência por negócio</h2>
              <p style={{ ...mutedText, fontSize: 12, margin: "0 0 14px" }}>
                Quantas conversas sustentam cada oportunidade.
              </p>
              {/* Hero figure: o número que resume a virada. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.022em" }}>
                  {data.evidence.avgSources}
                </span>
                <span style={{ ...mutedText, fontSize: 12 }}>
                  conversas por negócio, em média
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 76 }}>
                {data.evidence.buckets.map((b) => {
                  const h = data.evidence.max > 0 ? (b.opportunities / data.evidence.max) * 100 : 0;
                  return (
                    <div
                      key={b.sources}
                      title={`${b.opportunities} ${b.opportunities === 1 ? "negócio" : "negócios"} com ${b.sources} ${b.sources === 1 ? "conversa" : "conversas"}`}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        height: "100%",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 24,
                          height: `${Math.max(h, 4)}%`,
                          borderRadius: "4px 4px 0 0",
                          background: "var(--chart-cat-1)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ height: 1, background: "var(--chart-grid)", margin: "6px 0" }} />
              <div style={{ display: "flex", gap: 2 }}>
                {data.evidence.buckets.map((b) => (
                  <span
                    key={b.sources}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "center",
                      fontSize: 10,
                      color: "var(--color-muted-foreground)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {b.sources}
                  </span>
                ))}
              </div>
              <p style={{ ...mutedText, fontSize: 11, margin: "8px 0 0" }}>
                Eixo: nº de conversas-fonte.{" "}
                {data.evidence.single === 0
                  ? "Nenhum negócio apoiado numa conversa só."
                  : `${data.evidence.single} ${data.evidence.single === 1 ? "negócio ainda se apoia" : "negócios ainda se apoiam"} numa conversa só.`}
              </p>
            </div>
          ) : null}

          {/* Cobertura: uma razão contra um limite → meter, não pizza de 2 fatias. */}
          {data?.coverage.total ? (
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 style={{ ...cardTitleStyle, margin: 0 }}>Cobertura do acervo</h2>
              <p style={{ ...mutedText, fontSize: 12, margin: "0 0 14px" }}>
                Conversas processadas que já viraram evidência de negócio.
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.022em" }}>
                  {data.coverage.percent}%
                </span>
                <span style={{ ...mutedText, fontSize: 12 }}>
                  {data.coverage.analyzed} de {data.coverage.total} conversas
                </span>
              </div>
              {/* Trilho = um step da MESMA rampa, recuado em direção à
                  superfície. Em fundo escuro o step claro (--chart-seq-1) lê
                  como barra cheia; o recuo é para o escuro, não para o claro. */}
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "var(--chart-meter-track)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(data.coverage.percent, 1)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "var(--chart-seq-3)",
                  }}
                />
              </div>
              <p style={{ ...mutedText, fontSize: 11, margin: "10px 0 0" }}>
                As {data.coverage.total - data.coverage.analyzed} conversas restantes ainda não
                foram usadas em nenhuma geração de negócio.
              </p>
            </div>
          ) : null}

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
              <h2 style={{ ...cardTitleStyle, margin: 0 }}>Pipeline de novos negócios</h2>
              <button type="button" style={seeAllStyle} onClick={() => router.push("/novos-negocios")}>
                Ver Todas ›
              </button>
            </div>
            {data?.pipeline.length ? (
              data.pipeline.map((o, i) => (
                <div
                  key={o.id}
                  onClick={() => router.push("/novos-negocios")}
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
              <p style={{ ...mutedText, marginTop: 8 }}>Nenhum negócio no pipeline.</p>
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
