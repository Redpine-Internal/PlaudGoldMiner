"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../Button";
import { Icon } from "../Icon";
import type { EnrichmentSourceType, IdeaData } from "./useEnrichment";

interface ReferenceItem {
  id: string;
  kind: "link" | "image";
  title: string | null;
  url: string;
  storagePath: string | null;
}

// Conversa que originou a ideia (novo negócio ou conteúdo), com o trecho que a
// justifica.
interface IdeaSource {
  id: string;
  conversationId: string | null;
  conversationTitle: string | null;
  conversationDate: string | null;
  excerpt: string | null;
  /** `true` só quando o trecho é fala transcrita — o que autoriza as aspas. */
  fromTranscription?: boolean;
}

interface EnrichmentData {
  id: string;
  interesting: boolean;
  notes: string | null;
  textOverride: string | null;
  references: ReferenceItem[];
}

interface Props {
  sourceType: EnrichmentSourceType;
  sourceId: string;
  idea: IdeaData;
  onClose: () => void;
  onSaved: () => void;
  /** Avisa o provider da ideia recém-gerada, para não regerar ao reabrir. */
  onIdeaGenerated?: (sourceId: string, generated: string) => void;
}

const ALLOWED_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

const panel: React.CSSProperties = {
  padding: "12px 14px",
  background: "color-mix(in srgb, var(--background) 45%, var(--backgroundContainer))",
  borderRadius: 6,
  flexShrink: 0,
};

/**
 * O roteiro é gravado como JSON ({ angle, points[] }) pelo gerador, mas linhas
 * antigas podem trazer texto puro — os dois casos precisam renderizar.
 */
function parseOutline(outline?: string | null): { angle: string; points: string[]; text: string } | null {
  if (!outline?.trim()) return null;
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
    // Não é JSON — cai no texto puro.
  }
  return { angle: "", points: [], text: outline };
}

/** Ficha do conteúdo: formato, status, tema e roteiro. */
function ContentDetails({ idea }: { idea: IdeaData }) {
  const outline = parseOutline(idea.outline);
  const chips = [idea.formatLabel, idea.subtypeLabel, idea.statusLabel].filter(Boolean) as string[];
  const theme = idea.originalText.trim();
  if (!chips.length && !theme && !outline) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {chips.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => (
            <span key={c} className="ds-badge ds-badge--compact">
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {theme ? (
        <div style={panel}>
          <span className="ds-label" style={{ display: "block", marginBottom: 4 }}>Tema</span>
          <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>{theme}</p>
        </div>
      ) : null}
      {outline ? (
        <div style={panel}>
          <span className="ds-label" style={{ display: "block", marginBottom: 4 }}>Roteiro</span>
          {outline.angle ? (
            <p style={{ margin: "0 0 6px", font: "italic 400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>
              {outline.angle}
            </p>
          ) : null}
          {outline.points.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2, font: "400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>
              {outline.points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          ) : outline.text ? (
            <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>{outline.text}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function IdeaEnrichmentModal({ sourceType, sourceId, idea, onClose, onSaved, onIdeaGenerated }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interesting, setInteresting] = useState(false);
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [textEdited, setTextEdited] = useState(false);
  const [generatingIdea, setGeneratingIdea] = useState(false);
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [sources, setSources] = useState<IdeaSource[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Record<string, unknown> | null>(null);

  // Carrega o enriquecimento existente ao abrir. Para oportunidades sem
  // override e sem ideia cacheada, dispara a geração da ideia via IA — o modal
  // já renderiza (loading=false) enquanto a caixa mostra "gerando".
  useEffect(() => {
    let alive = true;
    (async () => {
      let override: string | null = null;
      let loaded = false;
      try {
        const res = await fetch(
          `/api/enrichment?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`
        );
        const body = (await res.json()) as { data: EnrichmentData | null };
        if (!alive) return;
        loaded = true;
        if (body.data) {
          setInteresting(body.data.interesting);
          setNotes(body.data.notes ?? "");
          setRefs(body.data.references || []);
          override = body.data.textOverride;
        }
      } catch {
        if (alive) setError("Não foi possível carregar o enriquecimento.");
      } finally {
        if (alive) setLoading(false);
      }
      if (!alive || !loaded) return;
      if (override != null) {
        setText(override);
        setTextEdited(true);
        return;
      }
      if (sourceType === "opportunity") {
        if (idea.generatedIdea) {
          setText(idea.generatedIdea);
          return;
        }
        setGeneratingIdea(true);
        try {
          const res = await fetch("/api/opportunities/idea", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: sourceId }),
          });
          const body = (await res.json()) as { data?: { idea: string }; error?: string };
          if (!alive) return;
          if (body.data?.idea) {
            setText(body.data.idea);
            // Guarda no provider: reabrir o card não deve voltar a "gerando".
            onIdeaGenerated?.(sourceId, body.data.idea);
          } else {
            setText(idea.originalText);
            setError(body.error || "Não foi possível gerar a ideia — exibindo o texto padrão.");
          }
        } catch {
          if (!alive) return;
          setText(idea.originalText);
          setError("Não foi possível gerar a ideia — exibindo o texto padrão.");
        } finally {
          if (alive) setGeneratingIdea(false);
        }
        return;
      }
      // Conteúdo: o artigo em si é o rascunho; o tema é só o fallback enquanto
      // o rascunho não foi gerado.
      setText(idea.draft?.trim() || idea.originalText);
    })();
    return () => {
      alive = false;
    };
  }, [sourceType, sourceId, idea.originalText, idea.generatedIdea, idea.draft, onIdeaGenerated]);

  // Conversas que originaram a ideia. Busca independente do enriquecimento:
  // falhar aqui não deve impedir o resto do modal. Insights não têm origem
  // rastreada, então só negócios e conteúdos consultam.
  useEffect(() => {
    const base =
      sourceType === "opportunity"
        ? "/api/opportunities"
        : sourceType === "content"
          ? "/api/contents"
          : null;
    if (!base) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(sourceId)}/sources`);
        const body = (await res.json()) as { data?: IdeaSource[] };
        if (alive && body.data) setSources(body.data);
      } catch {
        // Silencioso: a justificativa é complementar.
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceType, sourceId]);

  // PUT parcial dos campos de texto/flag.
  const put = async (patch: Record<string, unknown>) => {
    try {
      await fetch("/api/enrichment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId, ...patch }),
      });
      onSaved();
    } catch {
      setError("Falha ao salvar. Verifique a conexão.");
    }
  };

  // Autosave com debounce para notes e text.
  const scheduleSave = (patch: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = patch;
    saveTimer.current = setTimeout(() => {
      pendingSave.current = null;
      put(patch);
    }, 600);
  };

  // Descarrega imediatamente qualquer autosave pendente (ao fechar ou criar projeto),
  // evitando perder as últimas edições dentro da janela de debounce.
  const flushSave = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const patch = pendingSave.current;
    pendingSave.current = null;
    if (patch) await put(patch);
  };

  // Fecha o modal garantindo a persistência do que estava pendente.
  const handleClose = () => {
    void flushSave();
    onClose();
  };

  const toggleInteresting = () => {
    const next = !interesting;
    setInteresting(next);
    put({ interesting: next });
  };

  const addLink = async () => {
    if (!linkUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/enrichment/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          kind: "link",
          title: linkTitle.trim() || null,
          url: linkUrl.trim(),
        }),
      });
      const body = (await res.json()) as { data?: ReferenceItem; error?: string };
      if (body.data) {
        setRefs((r) => [...r, body.data as ReferenceItem]);
        setLinkTitle("");
        setLinkUrl("");
      } else {
        setError(body.error || "Falha ao adicionar link.");
      }
    } finally {
      setBusy(false);
    }
  };

  const addImage = async (file: File) => {
    if (!ALLOWED_IMG.includes(file.type)) {
      setError("Tipo de imagem não suportado.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Imagem maior que 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const up = await fetch("/api/enrichment/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId, filename: file.name, contentType: file.type }),
      });
      const upBody = (await up.json()) as {
        data?: { signedUrl: string; path: string; publicUrl: string };
        error?: string;
      };
      if (!upBody.data) {
        setError(upBody.error || "Falha ao preparar upload.");
        return;
      }
      // Upload direto ao Storage via signedUrl.
      const putRes = await fetch(upBody.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Falha no upload da imagem.");
        return;
      }
      const refRes = await fetch("/api/enrichment/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          kind: "image",
          title: file.name,
          url: upBody.data.publicUrl,
          storagePath: upBody.data.path,
        }),
      });
      const refBody = (await refRes.json()) as { data?: ReferenceItem };
      if (refBody.data) setRefs((r) => [...r, refBody.data as ReferenceItem]);
    } finally {
      setBusy(false);
    }
  };

  const removeRef = async (id: string) => {
    const res = await fetch(`/api/enrichment/reference?id=${id}`, { method: "DELETE" });
    if (res.ok) setRefs((r) => r.filter((x) => x.id !== id));
    else setError("Falha ao remover referência.");
  };

  // Monta a descrição enriquecida e cria o projeto.
  const createProject = async () => {
    setBusy(true);
    try {
      await flushSave();
      const parts = [text.trim()];
      if (notes.trim()) parts.push(`\n\nObservações:\n${notes.trim()}`);
      const links = refs.filter((r) => r.kind === "link");
      if (links.length) {
        parts.push(
          "\n\nFontes/Referências:\n" +
            links.map((l) => `- ${l.title ? l.title + ": " : ""}${l.url}`).join("\n")
        );
      }
      const description = parts.join("");
      const existing = await fetch(
        `/api/projects?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}&limit=1`
      );
      if (existing.ok) {
        const ex = await existing.json();
        const found = ex?.data?.[0];
        if (found?.id) {
          router.push(`/projetos/${found.id}`);
          return;
        }
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: idea.title, description, sourceType, sourceId }),
      });
      const body = await res.json();
      const id = body?.data?.id;
      if (id) router.push(`/projetos/${id}`);
      else setError(body?.error || "Falha ao criar projeto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ds-modal-backdrop"
      onClick={handleClose}
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
        className="ds-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(max(60vw, 720px), 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ font: "400 20px/28px var(--fontFamily)", margin: 0 }}>{idea.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant={interesting ? "primary" : "outline"}
              size="sm"
              icon="star"
              onClick={toggleInteresting}
              title={interesting ? "Remover de interessantes" : "Marcar como interessante"}
            >
              {interesting ? "Interessante" : "Marcar"}
            </Button>
            <button type="button" onClick={handleClose} title="Fechar" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" style={{ padding: "8px 12px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 6, font: "400 13px/18px var(--font-sans)" }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--color-muted-foreground)" }}>Carregando…</p>
        ) : (
          <>
            {sourceType === "opportunity" && (idea.pain || idea.context) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {idea.pain ? (
                  <div style={{ padding: "12px 14px", background: "color-mix(in srgb, var(--background) 45%, var(--backgroundContainer))", borderRadius: 6, flexShrink: 0 }}>
                    <span className="ds-label" style={{ display: "block", marginBottom: 4 }}>Dor identificada</span>
                    <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>{idea.pain}</p>
                  </div>
                ) : null}
                {idea.context ? (
                  <div style={{ padding: "12px 14px", background: "color-mix(in srgb, var(--background) 45%, var(--backgroundContainer))", borderRadius: 6, flexShrink: 0 }}>
                    <span className="ds-label" style={{ display: "block", marginBottom: 4 }}>O que foi levantado na conversa</span>
                    <p style={{ margin: 0, font: "400 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>{idea.context}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {sourceType === "content" ? <ContentDetails idea={idea} /> : null}

            {sources.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="ds-label">
                  {sources.length === 1
                    ? "Conversa de origem"
                    : `Conversas de origem (${sources.length})`}
                </span>
                {sources.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "12px 14px",
                      background: "color-mix(in srgb, var(--background) 45%, var(--backgroundContainer))",
                      borderRadius: 6,
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      {s.conversationId ? (
                        <a
                          href={`/conversas/${s.conversationId}`}
                          style={{ color: "var(--textLink)", font: "500 14px/20px var(--font-sans)" }}
                        >
                          {s.conversationTitle || "Conversa sem título"}
                        </a>
                      ) : (
                        <span style={{ font: "500 14px/20px var(--font-sans)", color: "var(--textPrimary)" }}>
                          {s.conversationTitle || "Conversa não encontrada"}
                        </span>
                      )}
                      {s.conversationDate ? (
                        <span style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>
                          {new Date(s.conversationDate).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      ) : null}
                    </div>
                    {s.excerpt ? (
                      // Aspas só quando se confirmou que é fala transcrita. O
                      // resto entra sem aspas e rotulado como não confirmado —
                      // inclui os trechos gravados antes da marca de procedência,
                      // que podem ser fala mas não dá para provar. O usuário leva
                      // isso a uma reunião comercial: citar o que ninguém disse
                      // queima a credibilidade do negócio inteiro.
                      <blockquote
                        style={{
                          margin: 0,
                          paddingLeft: 10,
                          borderLeft: "2px solid var(--color-border)",
                          font: "400 14px/20px var(--font-sans)",
                          color: s.fromTranscription ? "var(--textPrimary)" : "var(--color-muted-foreground)",
                          fontStyle: s.fromTranscription ? undefined : "italic",
                        }}
                      >
                        {s.fromTranscription ? (
                          `“${s.excerpt}”`
                        ) : (
                          <>
                            <span
                              style={{
                                display: "block",
                                fontStyle: "normal",
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: 2,
                              }}
                            >
                              Origem não confirmada — pode ser resumo, não fala
                            </span>
                            {s.excerpt}
                          </>
                        )}
                      </blockquote>
                    ) : (
                      // Análises antigas guardavam só a conversa, sem a passagem que
                      // sustentava a ideia — e o texto que sobrou é paráfrase, não fala,
                      // então não dá para reancorar na transcrição. Em vez de exibir um
                      // trecho inventado, aponta o usuário para a origem.
                      <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>
                        Gerada antes do registro de trechos —{" "}
                        {s.conversationId ? (
                          <a href={`/conversas/${s.conversationId}`} style={{ color: "var(--textLink)" }}>
                            abrir a conversa
                          </a>
                        ) : (
                          "conversa indisponível"
                        )}
                        .
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <label className="ds-label">
              {sourceType === "content" ? "Texto do artigo" : "Texto gerado"}{" "}
              {generatingIdea ? "(gerando…)" : textEdited ? "(editado)" : ""}
            </label>
            <textarea
              value={text}
              disabled={generatingIdea}
              placeholder={generatingIdea ? "Gerando a ideia a partir da dor e do contexto…" : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setTextEdited(true);
                scheduleSave({ textOverride: e.target.value });
              }}
              rows={8}
              style={{ width: "100%", resize: "vertical", flexShrink: 0, boxSizing: "border-box", padding: 8, borderRadius: 5, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
            />

            <label className="ds-label">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                scheduleSave({ notes: e.target.value });
              }}
              rows={4}
              placeholder="Suas anotações sobre esta ideia…"
              style={{ width: "100%", resize: "vertical", flexShrink: 0, boxSizing: "border-box", padding: 8, borderRadius: 5, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
            />

            <label className="ds-label">Fontes / Referências</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refs.filter((r) => r.kind === "link").map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="documents" size={16} />
                  <a href={r.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: "var(--textLink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title || r.url}
                  </a>
                  <button type="button" onClick={() => removeRef(r.id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Título (opcional)" style={{ width: 180, padding: 6, borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" style={{ flex: 1, padding: 6, borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <Button size="sm" variant="outline" icon="add-more" onClick={addLink} disabled={busy || !linkUrl.trim()}>Adicionar</Button>
              </div>
            </div>

            <label className="ds-label">Imagens</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {refs.filter((r) => r.kind === "image").map((r) => (
                <div key={r.id} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={r.title || "imagem"} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--color-border)" }} />
                  <button type="button" onClick={() => removeRef(r.id)} title="Remover" style={{ position: "absolute", top: 2, right: 2, background: "var(--backgroundContainer)", border: "1px solid var(--color-border)", borderRadius: 999, cursor: "pointer", padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <label style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--color-border)", borderRadius: 6, cursor: "pointer" }}>
                <Icon name="add-more" size={20} color="var(--color-muted-foreground)" />
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
              <Button variant="outline" onClick={handleClose}>Fechar</Button>
              <Button variant="primary" icon="layout-dashboard" iconSpin={busy} onClick={createProject} disabled={busy}>Criar Projeto</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
