"use client";

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { formatOpportunityType } from "@/lib/presentation/labels";

/**
 * Visão "Por tema": a leitura que a lista de cards não dá.
 *
 * Vinte negócios numa grade parecem vinte decisões. Agrupados, viram cinco ou
 * seis assuntos, e aí a pergunta muda de "qual card é bom?" para "qual assunto
 * o mercado repete?". O critério é recorrência — quantas conversas distintas
 * tocaram no tema — cruzada com o score dos negócios que ele contém.
 */

export interface ThemeBoardItem {
  id: string;
  title: string;
  score: number;
  type: string;
  priority?: string | null;
  themeId?: string | null;
}

export interface ThemeBoardTheme {
  id: string;
  name: string;
  rationale: string | null;
  updatedAt: string;
  opportunityIds: string[];
  conversationCount: number;
  conversationTitles: string[];
  /** Decisão do operador: ativo | priorizado | arquivado. */
  status?: string;
  /** Conversa mais antiga do tema — desde quando o assunto aparece. */
  firstSeenAt?: string | null;
  /** Conversa mais recente — é o que diz se o assunto esfriou. */
  lastSeenAt?: string | null;
  /** Leitura de mercado: 0 ninguém oferece … 3 consolidado. Null = não medido. */
  marketSaturation?: number | null;
  /** Probabilidade de haver grande consultoria entre os fornecedores. */
  marketBigPlayers?: number | null;
  /** A busca achou conteúdo, não ofertas — a leitura pede conferência. */
  marketContentOnly?: boolean | null;
  marketScannedAt?: string | null;
}

/**
 * Leitura curta do mercado para o cabeçalho do tema.
 *
 * A combinação é o que decide: demanda alta com as grandes consultorias na
 * frente é disputa cara; demanda menor sem especialista é campo aberto.
 * Nenhum dos dois números diz isso sozinho.
 */
export function formatMarket(theme: ThemeBoardTheme): { texto: string; livre: boolean } | null {
  if (theme.marketSaturation == null) return null;
  if (theme.marketContentOnly) return { texto: 'mercado a conferir', livre: false };

  const nivel = Math.round(theme.marketSaturation);
  const comGrandes = (theme.marketBigPlayers ?? 0) > 0.5;

  if (nivel === 0) return { texto: 'ninguém oferece', livre: true };
  if (nivel === 1) return { texto: 'poucos fornecedores', livre: true };
  if (nivel === 2)
    return comGrandes
      ? { texto: 'mercado formado', livre: false }
      : { texto: 'mercado formado, sem as grandes', livre: true };
  return comGrandes
    ? { texto: 'consolidado, com as grandes', livre: false }
    : { texto: 'consolidado entre especialistas', livre: false };
}

export interface ThemeBoardProps {
  themes: ThemeBoardTheme[];
  /** Todos os negócios da página; o board casa por id. */
  items: ThemeBoardItem[];
  /** Negócios ainda sem tema — motivo para reagrupar. */
  ungrouped: number;
  regrouping?: boolean;
  onRegroup: () => void;
  /** Refaz todos os temas do zero. Sem isto, só o encaixe incremental aparece. */
  onRegroupFull?: () => void;
  onSetPriority: (id: string, priority: string | null) => void;
  onOpenItem?: (id: string) => void;
  /** Marca o tema como priorizado/ativo. Sem isto o seletor não aparece. */
  onSetThemeStatus?: (id: string, status: string) => void;
  loading?: boolean;
}

/**
 * "desde jun/2026 · última menção em 14/09".
 *
 * É o que responde "isto está crescendo ou esfriando?" — a pergunta que decide
 * perseguir um tema. Sem isso o card mostra recorrência sem dizer se ela é de
 * agora ou de seis meses atrás.
 */
export function formatThemeWindow(
  firstSeenAt?: string | null,
  lastSeenAt?: string | null
): string | null {
  const parse = (v?: string | null) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const first = parse(firstSeenAt);
  const last = parse(lastSeenAt);
  if (!first && !last) return null;

  const mes = (d: Date) =>
    d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  const dia = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

  if (first && last) {
    // Mesmo dia: uma janela de um dia só não é "de X até Y".
    if (first.getTime() === last.getTime()) return `em ${dia(last)}`;
    return `desde ${mes(first)} · última menção em ${dia(last)}`;
  }
  return last ? `última menção em ${dia(last)}` : `desde ${mes(first!)}`;
}

/** As três marcas, na ordem em que aparecem no seletor. */
const PRIORITIES: Array<{ value: string; label: string; short: string }> = [
  { value: "alta", label: "Prioridade alta", short: "Alta" },
  { value: "media", label: "Prioridade média", short: "Média" },
  { value: "baixa", label: "Prioridade baixa", short: "Baixa" },
];

const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  alta: { bg: "var(--opp-qualificada-bg)", fg: "var(--opp-qualificada-fg)" },
  media: { bg: "var(--opp-analise-bg)", fg: "var(--opp-analise-fg)" },
  baixa: { bg: "var(--opp-descartada-bg)", fg: "var(--opp-descartada-fg)" },
};

/**
 * Peso do tema: recorrência × qualidade.
 *
 * Só recorrência põe na frente o assunto que todo mundo cita de passagem; só
 * score põe na frente um negócio ótimo que apareceu uma vez. O produto exige as
 * duas coisas. A média (e não a soma) dos scores evita que um tema ganhe
 * posição só por ter muitos cards fracos.
 */
export function themeWeight(theme: ThemeBoardTheme, items: ThemeBoardItem[]): number {
  const scores = theme.opportunityIds
    .map((id) => items.find((i) => i.id === id)?.score)
    .filter((s): s is number => typeof s === "number");
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return theme.conversationCount * avg;
}

export function ThemeBoard({
  themes,
  items,
  ungrouped,
  regrouping = false,
  onRegroup,
  onRegroupFull,
  onSetPriority,
  onOpenItem,
  onSetThemeStatus,
  loading = false,
}: ThemeBoardProps) {
  const [openSources, setOpenSources] = useState<string | null>(null);

  const ranked = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return themes
      .map((t) => ({
        theme: t,
        weight: themeWeight(t, items),
        // A ordem vem do SQL (score DESC); manter aqui evita reordenar na tela.
        members: t.opportunityIds
          .map((id) => byId.get(id))
          .filter((i): i is ThemeBoardItem => Boolean(i)),
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [themes, items]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="ds-skeleton" style={{ height: 132, borderRadius: 6 }} />
        ))}
      </div>
    );
  }

  if (!themes.length) {
    return (
      <div
        className="ds-card"
        style={{ display: "grid", gap: 12, justifyItems: "start", padding: 24 }}
      >
        <span style={{ font: "600 16px/24px var(--fontFamily)" }}>
          Os negócios ainda não foram agrupados
        </span>
        <span
          style={{
            font: "400 14px/22px var(--font-sans)",
            color: "var(--color-muted-foreground)",
            maxWidth: 560,
          }}
        >
          O agrupamento lê os títulos dos negócios e junta os que falam do mesmo assunto.
          Ele usa IA e roda só quando você pedir.
        </span>
        <Button variant="primary" onClick={onRegroup} disabled={regrouping || !items.length}>
          {regrouping ? "Agrupando…" : "Agrupar por tema"}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {ungrouped > 0 ? (
        <div
          role="status"
          className="ds-card"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
          }}
        >
          <span style={{ font: "400 14px/22px var(--font-sans)" }}>
            {ungrouped === 1
              ? "1 negócio novo ainda está fora dos temas."
              : `${ungrouped} negócios novos ainda estão fora dos temas.`}
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <Button variant="outline" onClick={onRegroup} disabled={regrouping}>
              {regrouping ? "Encaixando…" : "Encaixar nos temas"}
            </Button>
            {/* Refazer tudo relê o acervo inteiro e pode renomear temas: é a
                saída quando o encaixe não resolve, não a ação do dia a dia. */}
            {onRegroupFull ? (
              <Button variant="ghost" onClick={onRegroupFull} disabled={regrouping}>
                Refazer todos
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ranked.map(({ theme, members }) => {
        const sourcesOpen = openSources === theme.id;
        // `opportunityIds` vem do servidor com TODOS os negócios do tema;
        // `members` só tem os que estão na página aberta.
        const totalMembers = theme.opportunityIds.length;
        const janela = formatThemeWindow(theme.firstSeenAt, theme.lastSeenAt);
        const mercado = formatMarket(theme);
        return (
          <section
            key={theme.id}
            className="ds-card"
            style={{ display: "grid", gap: 12, padding: 20 }}
          >
            <header style={{ display: "grid", gap: 4 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ font: "600 18px/26px var(--fontFamily)" }}>{theme.name}</h3>
                <span
                  className="ds-badge ds-badge--compact"
                  style={{ background: "var(--opp-consultoria-bg)", color: "var(--opp-consultoria-fg)" }}
                >
                  {theme.conversationCount === 1
                    ? "1 conversa"
                    : `${theme.conversationCount} conversas`}
                </span>
                <span
                  style={{
                    font: "500 12px/20px var(--font-sans)",
                    color: "var(--color-muted-foreground)",
                  }}
                >
                  {/* Conta os negócios DO TEMA, não os que caíram nesta página:
                      `members` só tem os itens paginados, e o card dizia
                      "2 negócios" num tema de 48. */}
                  {totalMembers === 1 ? "1 negócio" : `${totalMembers} negócios`}
                </span>
                {janela ? (
                  <span
                    style={{
                      font: "400 12px/20px var(--font-sans)",
                      color: "var(--color-muted-foreground)",
                    }}
                  >
                    {janela}
                  </span>
                ) : null}
                {mercado ? (
                  <span
                    className="ds-badge ds-badge--compact"
                    title="Leitura de mercado — confira as fontes antes de decidir"
                    style={
                      mercado.livre
                        ? { background: 'var(--opp-qualificada-bg)', color: 'var(--opp-qualificada-fg)' }
                        : { background: 'var(--opp-descartada-bg)', color: 'var(--opp-descartada-fg)' }
                    }
                  >
                    {mercado.texto}
                  </span>
                ) : null}
                {onSetThemeStatus ? (
                  <ThemeStatusSelect
                    value={theme.status ?? "ativo"}
                    onChange={(s) => onSetThemeStatus(theme.id, s)}
                  />
                ) : null}
              </div>
              {theme.rationale ? (
                <p
                  style={{
                    font: "400 14px/22px var(--font-sans)",
                    color: "var(--color-muted-foreground)",
                    maxWidth: 720,
                  }}
                >
                  {theme.rationale}
                </p>
              ) : null}
            </header>

            <ul style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
              {members.map((m) => (
                <li
                  key={m.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenItem?.(m.id)}
                    style={{
                      font: "500 14px/22px var(--font-sans)",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: onOpenItem ? "pointer" : "default",
                      color: "inherit",
                      minWidth: 0,
                      flex: "1 1 240px",
                    }}
                  >
                    {m.title}
                  </button>
                  <span
                    className="ds-badge ds-badge--compact"
                    style={{ background: `var(--opp-${m.type}-bg)`, color: `var(--opp-${m.type}-fg)` }}
                  >
                    {formatOpportunityType(m.type)}
                  </span>
                  <span
                    style={{
                      font: "500 12px/20px var(--font-sans)",
                      color: "var(--color-muted-foreground)",
                      width: 64,
                      textAlign: "right",
                    }}
                  >
                    Score {Math.round(m.score)}%
                  </span>
                  <PrioritySelect
                    value={m.priority ?? null}
                    onChange={(p) => onSetPriority(m.id, p)}
                  />
                </li>
              ))}
            </ul>

            {/* Sem isto o card parece incompleto sem explicar por quê: a lista
                mostra os negócios da página aberta, o contador mostra o tema. */}
            {totalMembers > members.length ? (
              <p
                style={{
                  font: "400 12px/20px var(--font-sans)",
                  color: "var(--color-muted-foreground)",
                  margin: 0,
                }}
              >
                Mostrando {members.length} de {totalMembers} — os demais estão nas outras páginas.
              </p>
            ) : null}

            {/* Prova de origem: de onde o tema veio, sem abrir card nenhum. */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSources(sourcesOpen ? null : theme.id)}
                aria-expanded={sourcesOpen}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  font: "500 13px/20px var(--font-sans)",
                  color: "var(--color-muted-foreground)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <Icon name={sourcesOpen ? "chevron-up" : "chevron-down"} size={14} />
                {sourcesOpen ? "Ocultar as conversas" : "Ver as conversas que sustentam o tema"}
              </button>
              {sourcesOpen ? (
                <ul
                  style={{
                    display: "grid",
                    gap: 4,
                    listStyle: "none",
                    margin: "8px 0 0",
                    padding: 0,
                  }}
                >
                  {theme.conversationTitles.map((title, i) => (
                    <li
                      key={`${theme.id}-${i}`}
                      style={{
                        font: "400 13px/20px var(--font-sans)",
                        color: "var(--color-muted-foreground)",
                      }}
                    >
                      · {title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Prioridade do TEMA — o que o operador decidiu sobre o assunto.
 *
 * Diferente da prioridade do negócio: aqui a decisão é "vale perseguir este
 * assunto?". Sobrevive ao reagrupamento porque o tema agora é permanente
 * (UPSERT por slug); antes o próximo reagrupamento apagava a marca junto com o
 * registro, e marcar prioridade não fazia sentido.
 */
function ThemeStatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  const priorizado = value === "priorizado";
  return (
    <label style={{ display: "inline-flex", alignItems: "center" }}>
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        Situação do tema
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          font: "500 12px/20px var(--font-sans)",
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          background: priorizado ? "var(--opp-qualificada-bg)" : "transparent",
          color: priorizado ? "var(--opp-qualificada-fg)" : "var(--color-muted-foreground)",
          cursor: "pointer",
        }}
      >
        <option value="ativo">Acompanhando</option>
        <option value="priorizado">Perseguir</option>
        <option value="arquivado">Arquivar</option>
      </select>
    </label>
  );
}

/** Marca de prioridade — decisão do usuário, não da IA. */
function PrioritySelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (priority: string | null) => void;
}) {
  const style = value ? PRIORITY_STYLE[value] : null;
  return (
    <label style={{ display: "inline-flex", alignItems: "center" }}>
      {/* O projeto não tem classe utilitária de leitor de tela; o recorte de 1px
          é a forma padrão de rotular sem ocupar espaço na linha. */}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        Prioridade
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          font: "500 12px/20px var(--font-sans)",
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          background: style ? style.bg : "transparent",
          color: style ? style.fg : "var(--color-muted-foreground)",
          cursor: "pointer",
        }}
      >
        <option value="">Sem prioridade</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.short}
          </option>
        ))}
      </select>
    </label>
  );
}
