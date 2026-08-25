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
}

const ALLOWED_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export function IdeaEnrichmentModal({ sourceType, sourceId, idea, onClose, onSaved }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interesting, setInteresting] = useState(false);
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [textEdited, setTextEdited] = useState(false);
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Record<string, unknown> | null>(null);

  // Carrega o enriquecimento existente ao abrir.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/enrichment?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`
        );
        const body = (await res.json()) as { data: EnrichmentData | null };
        if (!alive) return;
        if (body.data) {
          setInteresting(body.data.interesting);
          setNotes(body.data.notes ?? "");
          setText(body.data.textOverride ?? idea.originalText);
          setTextEdited(body.data.textOverride != null);
          setRefs(body.data.references || []);
        } else {
          setText(idea.originalText);
        }
      } catch {
        if (alive) setError("Não foi possível carregar o enriquecimento.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceType, sourceId, idea.originalText]);

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
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--backgroundContainer)",
          borderRadius: 12,
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
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
          <div role="alert" style={{ padding: "8px 12px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: 8, font: "400 13px/18px var(--font-sans)" }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--color-muted-foreground)" }}>Carregando…</p>
        ) : (
          <>
            <label className="ds-label">Texto gerado {textEdited ? "(editado)" : ""}</label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTextEdited(true);
                scheduleSave({ textOverride: e.target.value });
              }}
              rows={6}
              style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: 8, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
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
              style={{ width: "100%", resize: "vertical", padding: 8, borderRadius: 8, border: "1px solid var(--color-border)", font: "400 14px/20px var(--font-sans)", background: "var(--background)", color: "var(--textPrimary)" }}
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
                <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Título (opcional)" style={{ width: 180, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--background)", color: "var(--textPrimary)" }} />
                <Button size="sm" variant="outline" icon="add-more" onClick={addLink} disabled={busy || !linkUrl.trim()}>Adicionar</Button>
              </div>
            </div>

            <label className="ds-label">Imagens</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {refs.filter((r) => r.kind === "image").map((r) => (
                <div key={r.id} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={r.title || "imagem"} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
                  <button type="button" onClick={() => removeRef(r.id)} title="Remover" style={{ position: "absolute", top: 2, right: 2, background: "var(--backgroundContainer)", border: "1px solid var(--color-border)", borderRadius: 999, cursor: "pointer", padding: 2 }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <label style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--color-border)", borderRadius: 8, cursor: "pointer" }}>
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
