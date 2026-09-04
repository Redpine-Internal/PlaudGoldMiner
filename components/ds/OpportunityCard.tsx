import React from "react";
import { Icon } from "./Icon";
import { useEnrichment } from "./enrichment/useEnrichment";
import { formatOpportunityStatus, formatOpportunityType } from "@/lib/presentation/labels";

/** Compõe o texto padrão do enriquecimento a partir dos campos do negócio. */
function buildEnrichText(opts: {
  type?: string;
  subtype?: string | null;
  pain?: string;
  context?: string | null;
  conversationTitle?: string;
}): string {
  const label = formatOpportunityType(opts.type);
  const head =
    `Novo negócio de ${label.toLowerCase()}` +
    (opts.subtype ? ` — ${opts.subtype}` : "") +
    (opts.conversationTitle ? `, identificada na conversa "${opts.conversationTitle}"` : "") +
    ".";
  const parts = [head];
  if (opts.pain) parts.push(`Dor identificada: ${opts.pain}`);
  if (opts.context) parts.push(`Contexto: ${opts.context}`);
  return parts.join("\n\n");
}

export interface OpportunityCardProps {
  title?: string;
  pain?: string;
  context?: string | null;
  type?: string;
  subtype?: string | null;
  status?: string;
  score?: number;
  conversationTitle?: string;
  createdAt?: string | Date;
  selected?: boolean;
  onSelect?: React.MouseEventHandler<HTMLDivElement>;
  sourceId?: string;
  enrichText?: string;
  /** Ideia redigida pela IA (cache); ausente dispara geração ao abrir o modal. */
  generatedIdea?: string | null;
  /** Quantas conversas sustentam o negócio. A recorrência é o que dá valor à
   *  oportunidade, então ela vale mais na meta do que o título de uma conversa. */
  sourceCount?: number;
  /** Slot de ação renderizado dentro do card (ex.: botão de projeto). */
  action?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/** Opportunity list card — labels, chips and meta row from app/novos-negocios. */
export function OpportunityCard({
  title,
  pain,
  context,
  type = "produto",
  subtype,
  status = "nova",
  score = 0,
  conversationTitle,
  createdAt,
  selected = false,
  onSelect,
  sourceId,
  enrichText,
  generatedIdea,
  sourceCount,
  action,
  style,
  className = "",
}: OpportunityCardProps) {
  const fmt = (ds: string | Date) =>
    new Date(ds).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const enrichment = useEnrichment();
  const interesting = enrichment && sourceId ? enrichment.isInteresting("opportunity", sourceId) : false;
  const handleCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (enrichment && sourceId) {
      enrichment.openEnrichment("opportunity", sourceId, {
        title: title ?? "",
        originalText: enrichText ?? buildEnrichText({ type, subtype, pain, context, conversationTitle }),
        pain,
        context,
        generatedIdea,
      });
    }
    onSelect?.(e);
  };
  return (
    <div
      onClick={handleCardClick}
      className={["ds-card ds-card--clickable pgm-opportunity-card", selected ? "ds-card--selected" : "", className].filter(Boolean).join(" ")}
      style={{ boxSizing: "border-box", ...style }}
    >
      <div className="pgm-opportunity-card__main">
        <div className="pgm-opportunity-card__heading">
          <h2>{title}</h2>
          {interesting ? <Icon name="star" size={15} color="var(--bronze)" /> : null}
        </div>
        <span className="pgm-opportunity-card__meta">
          {createdAt ? fmt(createdAt) + " · " : ""}Score {Math.round(score)}%
          {sourceCount && sourceCount > 1
            ? ` · ${sourceCount} conversas`
            : conversationTitle
              ? " · De: " + conversationTitle
              : ""}
        </span>
        {subtype ? <p className="pgm-opportunity-card__subtype"><Icon name="tag" size={12} />{subtype}</p> : null}
        {pain ? <p className="pgm-opportunity-card__pain" title={pain}>{pain}</p> : null}
        {context ? <p className="pgm-opportunity-card__context" title={context}>{context}</p> : null}
      </div>
      <div className="pgm-opportunity-card__type">
        <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${type}-bg)`, color: `var(--opp-${type}-fg)` }}>
          {formatOpportunityType(type)}
        </span>
      </div>
      <div className="pgm-opportunity-card__status">
        <span className="ds-badge ds-badge--compact" style={{ background: `var(--opp-${status}-bg)`, color: `var(--opp-${status}-fg)` }}>
          {formatOpportunityStatus(status)}
        </span>
      </div>
      {action ? <div className="pgm-opportunity-card__actions">{action}</div> : null}
    </div>
  );
}
