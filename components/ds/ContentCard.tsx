import React from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { useEnrichment } from "./enrichment/useEnrichment";

const P: Record<string, { icon: string; color: string; label: string }> = {
  youtube: { icon: "youtube", color: "var(--platform-youtube-icon)", label: "YouTube" },
  linkedin: { icon: "linkedin", color: "var(--platform-linkedin-icon)", label: "LinkedIn" },
  artigo: { icon: "book-open", color: "var(--platform-artigo-icon)", label: "Artigo" },
  blog: { icon: "book-open", color: "var(--platform-blog-icon)", label: "Artigo" },
};
const STATUS: Record<string, string> = {
  sugerido: "Sugerido", rascunho: "Rascunho", em_revisao: "Em revisão",
  aprovado: "Aprovado", producao: "Em produção", publicado: "Publicado", descartado: "Descartado",
};

export interface ContentCardProps {
  title?: string;
  platform?: string;
  theme?: string;
  outline?: string;
  mentionCount?: number;
  relevanceScore?: number;
  status?: string;
  onApprove?: React.MouseEventHandler<HTMLButtonElement>;
  onDiscard?: React.MouseEventHandler<HTMLButtonElement>;
  /** Slot de ação renderizado dentro do card (ex.: botão de projeto). */
  action?: React.ReactNode;
  sourceId?: string;
  enrichText?: string;
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
  platform = "blog",
  theme,
  outline,
  mentionCount = 0,
  relevanceScore = 0,
  status = "sugerido",
  onApprove,
  onDiscard,
  action,
  sourceId,
  enrichText,
  style,
  className = "",
}: ContentCardProps) {
  const p = P[platform] || P.blog;
  // outline is stored as JSON ({ angle, points[] }) by the generator, but may be
  // a plain string for legacy/mock rows — handle both gracefully.
  const parsed = parseOutline(outline);
  // relevanceScore comes through as 0-100 from the generator; older rows may be
  // 0-1. Normalise so we never render "9800%".
  const relevancePct = relevanceScore <= 1 ? Math.round(relevanceScore * 100) : Math.round(relevanceScore);
  const enrichment = useEnrichment();
  const interesting = enrichment && sourceId ? enrichment.isInteresting("content", sourceId) : false;
  const handleCardClick = () => {
    if (enrichment && sourceId) {
      enrichment.openEnrichment("content", sourceId, { title: title ?? "", originalText: enrichText ?? theme ?? "" });
    }
  };
  return (
    <div
      className={("ds-card " + className).trim()}
      onClick={handleCardClick}
      style={{ display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", cursor: sourceId ? "pointer" : undefined, ...style }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={p.icon} size={20} color={p.color} />
          <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{p.label}</span>
          {interesting ? <Icon name="star" size={14} color="var(--brand)" /> : null}
        </div>
        <span className="ds-badge ds-badge--compact" style={{ background: `var(--content-${status}-bg)`, color: `var(--content-${status}-fg)` }}>
          {STATUS[status] || status}
        </span>
      </div>
      <h3 style={{ font: "400 16px/24px var(--fontFamily)", marginBottom: 4 }}>{title}</h3>
      <p style={{ margin: "0 0 8px", font: "400 14px/20px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{theme}</p>
      {parsed ? (
        <div
          style={{
            font: "400 12px/16px var(--font-sans)",
            color: "var(--color-muted-foreground)",
            background: "color-mix(in srgb, var(--color-muted) 50%, transparent)",
            padding: 8,
            borderRadius: "var(--radius)",
            marginBottom: 12,
          }}
        >
          {parsed.angle ? <p style={{ margin: "0 0 6px", fontStyle: "italic" }}>{parsed.angle}</p> : null}
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>Outline:</p>
          {parsed.points.length ? (
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {parsed.points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0 }}>{parsed.text}</p>
          )}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "400 12px/16px var(--font-sans)",
          color: "var(--color-muted-foreground)",
          marginTop: "auto",
          paddingTop: 8,
          marginBottom: ["sugerido", "rascunho", "em_revisao", "aprovado", "producao"].includes(status) ? 12 : 0,
        }}
      >
        <span>Mencionado {mentionCount}x</span>
        <span>Relevância: {relevancePct}%</span>
      </div>
      {status === "sugerido" && (onApprove || onDiscard) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          {onApprove ? <Button size="sm" icon="check" onClick={(e) => { e.stopPropagation(); onApprove(e); }} style={{ flex: 1 }}>
            Gerar rascunho
          </Button>
          : null}
          {onDiscard ? <Button size="sm" variant="outline" icon="trash-2" onClick={(e) => { e.stopPropagation(); onDiscard(e); }} /> : null}
        </div>
      ) : null}
      {status === "rascunho" && onApprove ? (
        <div style={{ display: "flex", paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onApprove(e); }} style={{ flex: 1 }}>
            Enviar para revisão
          </Button>
        </div>
      ) : null}
      {status === "em_revisao" && onApprove ? (
        <div style={{ display: "flex", paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          <Button size="sm" icon="check" onClick={(e) => { e.stopPropagation(); onApprove(e); }} style={{ flex: 1 }}>
            Aprovar
          </Button>
        </div>
      ) : null}
      {status === "aprovado" && onApprove ? (
        <div style={{ display: "flex", paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          <Button size="sm" variant="outline" icon="check" onClick={(e) => { e.stopPropagation(); onApprove(e); }} style={{ flex: 1 }}>
            Marcar como publicado
          </Button>
        </div>
      ) : null}
      {action ? (
        <div style={{ paddingTop: 12, marginTop: 12, borderTop: "1px solid var(--color-border)" }}>{action}</div>
      ) : null}
    </div>
  );
}
