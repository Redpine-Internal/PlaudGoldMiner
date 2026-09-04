import React from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { useEnrichment } from "./enrichment/useEnrichment";
import { formatContentFormat, formatContentStatus } from "@/lib/presentation/labels";

// Formatos de conteúdo. `youtube`/`linkedin`/`blog` são valores legados que a
// migração 2026-08-28 converteu, mas seguem mapeados por segurança.
const P: Record<string, { icon: string; color: string }> = {
  artigo: { icon: "book-open", color: "var(--platform-artigo-icon)" },
  post: { icon: "message-square", color: "var(--platform-post-icon)" },
  carrossel: { icon: "layers", color: "var(--platform-carrossel-icon)" },
  roteiro: { icon: "clapperboard", color: "var(--platform-roteiro-icon)" },
  blog: { icon: "book-open", color: "var(--platform-artigo-icon)" },
  linkedin: { icon: "message-square", color: "var(--platform-post-icon)" },
  youtube: { icon: "clapperboard", color: "var(--platform-roteiro-icon)" },
};
export interface ContentCardProps {
  title?: string;
  /** Formato do conteúdo: artigo | post | carrossel | roteiro. */
  platform?: string;
  /** Variação livre dentro do formato (ex.: "LinkedIn"). */
  subtype?: string | null;
  theme?: string;
  outline?: string;
  mentionCount?: number;
  relevanceScore?: number;
  status?: string;
  createdAt?: string | null;
  onApprove?: React.MouseEventHandler<HTMLButtonElement>;
  onDiscard?: React.MouseEventHandler<HTMLButtonElement>;
  /** Slot de ação renderizado dentro do card (ex.: botão de projeto). */
  action?: React.ReactNode;
  sourceId?: string;
  enrichText?: string;
  /** Texto do artigo já gerado — abre dentro do modal, editável. */
  draft?: string | null;
  style?: React.CSSProperties;
  className?: string;
}

interface ParsedOutline {
  angle: string;
  points: string[];
  text: string;
}

/** Parse the outline field, which may be JSON ({ angle, points[] }) or plain text. */
function parseOutline(outline?: string): ParsedOutline | null {
  if (!outline) return null;
  try {
    const o = JSON.parse(outline);
    if (o && typeof o === "object" && (Array.isArray(o.points) || typeof o.angle === "string")) {
      return {
        angle: typeof o.angle === "string" ? o.angle : "",
        points: Array.isArray(o.points) ? o.points.map(String) : [],
        text: "",
      };
    }
  } catch {
    // Not JSON — fall through to plain-text rendering.
  }
  return { angle: "", points: [], text: outline };
}

/** Content-suggestion card — structure and actions from app/conteudos. */
export function ContentCard({
  title,
  platform = "artigo",
  subtype,
  theme,
  outline,
  mentionCount = 0,
  relevanceScore = 0,
  status = "sugerido",
  createdAt,
  onApprove,
  onDiscard,
  action,
  sourceId,
  enrichText,
  draft,
  style,
  className = "",
}: ContentCardProps) {
  const p = P[platform] || P.artigo;
  const sub = subtype?.trim();
  // outline is stored as JSON ({ angle, points[] }) by the generator, but may be
  // a plain string for legacy/mock rows — handle both gracefully.
  const parsed = parseOutline(outline);
  // relevanceScore comes through as 0-100 from the generator; older rows may be
  // 0-1. Normalise so we never render "9800%".
  const relevancePct = relevanceScore <= 1 ? Math.round(relevanceScore * 100) : Math.round(relevanceScore);
  const enrichment = useEnrichment();
  const interesting = enrichment && sourceId ? enrichment.isInteresting("content", sourceId) : false;
  const formattedDate = createdAt
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(createdAt))
    : "não informada";
  const handleCardClick = () => {
    if (enrichment && sourceId) {
      enrichment.openEnrichment("content", sourceId, {
        title: title ?? "",
        originalText: enrichText ?? theme ?? "",
        draft,
        outline,
        formatLabel: formatContentFormat(platform),
        subtypeLabel: sub || null,
        statusLabel: formatContentStatus(status),
      });
    }
  };
  let primaryAction: React.ReactNode = null;
  if (status === "sugerido" && onApprove) {
    primaryAction = (
      <Button size="sm" icon="check" onClick={(event) => { event.stopPropagation(); onApprove(event); }}>
        Gerar rascunho
      </Button>
    );
  } else if (status === "rascunho" && onApprove) {
    primaryAction = (
      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); onApprove(event); }}>
        Enviar para revisão
      </Button>
    );
  } else if (status === "em_revisao" && onApprove) {
    primaryAction = (
      <Button size="sm" icon="check" onClick={(event) => { event.stopPropagation(); onApprove(event); }}>
        Aprovar
      </Button>
    );
  } else if (status === "aprovado" && onApprove) {
    primaryAction = (
      <Button size="sm" variant="outline" icon="check" onClick={(event) => { event.stopPropagation(); onApprove(event); }}>
        Marcar como publicado
      </Button>
    );
  }
  const canDiscard = Boolean(onDiscard) && !["descartado", "publicado"].includes(status);

  return (
    <div
      className={("ds-card pgm-content-card " + className).trim()}
      onClick={handleCardClick}
      style={{ display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", cursor: sourceId ? "pointer" : undefined, ...style }}
    >
      <div className="pgm-content-card__meta">
        <div className="pgm-content-card__format">
          <Icon name={p.icon} size={20} color={p.color} />
          <span>
            {sub ? `${formatContentFormat(platform)} · ${sub}` : formatContentFormat(platform)}
          </span>
          {interesting ? <Icon name="star" size={14} color="var(--brand)" /> : null}
        </div>
        <span className="ds-badge ds-badge--compact" style={{ background: `var(--content-${status}-bg)`, color: `var(--content-${status}-fg)` }}>
          {formatContentStatus(status)}
        </span>
      </div>
      <h2 className="pgm-content-card__title">{title}</h2>
      <p className="pgm-content-card__theme">{theme}</p>
      {parsed ? (
        <div className="pgm-content-card__outline">
          {parsed.angle ? <p style={{ margin: "0 0 6px", fontStyle: "italic" }}>{parsed.angle}</p> : null}
          <p className="pgm-content-card__outline-label">Estrutura</p>
          {parsed.points.length ? (
            <ul>
              {parsed.points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0 }}>{parsed.text}</p>
          )}
        </div>
      ) : null}
      <div className="pgm-content-card__stats">
        <span>Mencionado {mentionCount}x</span>
        <span>Relevância: {relevancePct}%</span>
        <span>Data: {formattedDate}</span>
      </div>
      {primaryAction || action || canDiscard ? (
        <div className="pgm-content-card__actions">
          {primaryAction}
          {action}
          {canDiscard ? (
            <Button size="sm" variant="ghost" icon="trash-2" onClick={(event) => { event.stopPropagation(); onDiscard?.(event); }}>
              Descartar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
