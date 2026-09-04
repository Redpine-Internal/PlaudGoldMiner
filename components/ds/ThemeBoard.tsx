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
}

export interface ThemeBoardProps {
  themes: ThemeBoardTheme[];
  /** Todos os negócios da página; o board casa por id. */
  items: ThemeBoardItem[];
  /** Negócios ainda sem tema — motivo para reagrupar. */
  ungrouped: number;
  regrouping?: boolean;
  onRegroup: () => void;
  onSetPriority: (id: string, priority: string | null) => void;
  onOpenItem?: (id: string) => void;
  loading?: boolean;
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
  onSetPriority,
  onOpenItem,
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
          <Button
            variant="outline"
            onClick={onRegroup}
            disabled={regrouping}
            style={{ marginLeft: "auto" }}
          >
            {regrouping ? "Agrupando…" : "Reagrupar"}
          </Button>
        </div>
      ) : null}

      {ranked.map(({ theme, members }) => {
        const sourcesOpen = openSources === theme.id;
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
                  {members.length === 1 ? "1 negócio" : `${members.length} negócios`}
                </span>
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
