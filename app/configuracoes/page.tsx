"use client";
import { useEffect, useState } from "react";
import { Icon, Input, Button } from "@/components/ds";
import {
  ACCENTS,
  AUX_PRESETS,
  BGS,
  THEME_KEY_ACCENT,
  THEME_KEY_AUX,
  THEME_KEY_BG,
  applyAccent,
  applyAux,
  applyBg,
} from "@/lib/theme";

const secTitle: React.CSSProperties = { font: "400 18px/24px var(--fontFamily)", marginBottom: 4 };
const secDesc: React.CSSProperties = { margin: "0 0 16px", font: "400 13px/18px var(--fontFamily)", color: "var(--textSecondary)" };

interface N8nHealth {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  status?: number;
  error?: string;
}

function N8nSection() {
  // "off" = not connected yet · "form" = entering creds · "connecting" = pinging · "on" = reachable
  const [status, setStatus] = useState<string>("off");
  const [health, setHealth] = useState<N8nHealth | null>(null);
  const [url, setUrl] = useState("https://n8n-prd.mychatbot.us");
  const [key, setKey] = useState("");

  // On mount, ask the server if n8n is already configured + reachable.
  useEffect(() => {
    let alive = true;
    fetch("/api/n8n/status")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const h: N8nHealth | undefined = j?.data;
        if (h) {
          setHealth(h);
          if (h.baseUrl) setUrl(h.baseUrl);
          if (h.configured && h.reachable) setStatus("on");
        }
      })
      .catch(() => {
        /* offline — stays off */
      });
    return () => {
      alive = false;
    };
  }, []);

  const connect = async () => {
    setStatus("connecting");
    try {
      const res = await fetch("/api/n8n/status");
      const j = await res.json();
      const h: N8nHealth | undefined = j?.data;
      setHealth(h ?? null);
      setStatus(h?.reachable ? "on" : "form");
    } catch {
      setStatus("form");
    }
  };
  const disconnect = () => {
    setStatus("off");
  };

  return (
    <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "400 14px/20px var(--fontFamily)" }}>
          <Icon name="controls" size={20} color="var(--textSecondary)" />
          n8n · automações
        </span>
        {status === "on" ? (
          <span className="ds-badge" style={{ background: "var(--accent-success)", color: "var(--textButtonPrimary)" }}>
            Conectado
          </span>
        ) : status === "connecting" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 13px/18px var(--fontFamily)", color: "var(--textSecondary)" }}>
            <Icon name="reload" size={14} className="ds-spin" />
            Conectando...
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setStatus("form")}>
            Conectar
          </Button>
        )}
      </div>
      {status === "form" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          <Input label="URL da instância" value={url} onChange={setUrl} placeholder="https://sua-instancia.n8n.cloud" />
          <Input label="API Key" type="password" value={key} onChange={setKey} placeholder="n8n_api_..." />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" icon="check" onClick={connect} disabled={!url || !key}>
              Conectar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus("off")}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
      {status === "on" ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {(
            [
              ["Processar reunião (transcrição + resumo)", "Ativo"],
              ["Detectar novos negócios", "Ativo"],
              ["Comparar embeddings da base do Clone", "Ativo"],
              ["Insights de artigos científicos", "Ativo"],
              ["Gerar conteúdo social", "Ativo"],
            ] as [string, string][]
          ).map(([w, st]) => (
            <div
              key={w}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", background: "var(--background)", borderRadius: 8 }}
            >
              <span style={{ font: "400 13px/18px var(--fontFamily)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w}</span>
              <span
                className="ds-badge ds-badge--compact"
                style={{ background: st === "Ativo" ? "var(--accent-success)" : "var(--accent-inactive)", color: "var(--textButtonPrimary)", flexShrink: 0 }}
              >
                {st}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ font: "400 12px/16px var(--fontFamily)", color: "var(--textSecondary)" }}>
              {health?.baseUrl ?? "n8n"}
              {health?.configured === false ? " · sem N8N_WEBHOOK_SECRET" : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              Desconectar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ConfiguracoesPage = () => {
  const [accent, setAccent] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_KEY_ACCENT) || "#000000";
    } catch {
      return "#000000";
    }
  });
  const [aux, setAux] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_KEY_AUX) || "mistica";
    } catch {
      return "mistica";
    }
  });
  const [bg, setBg] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_KEY_BG) || "#ECECEC";
    } catch {
      return "#ECECEC";
    }
  });

  const pickAccent = (hex: string) => {
    setAccent(hex);
    applyAccent(hex);
    try {
      localStorage.setItem(THEME_KEY_ACCENT, hex);
    } catch {
      /* ignore */
    }
  };
  const pickAux = (name: string) => {
    setAux(name);
    applyAux(name);
    try {
      localStorage.setItem(THEME_KEY_AUX, name);
    } catch {
      /* ignore */
    }
  };
  const pickBg = (hex: string) => {
    setBg(hex);
    applyBg(hex);
    try {
      localStorage.setItem(THEME_KEY_BG, hex);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: "0 0 20px" }}>Configurações</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        <div className="ds-card" style={{ padding: 20 }}>
          <h2 style={secTitle}>Cor principal</h2>
          <p style={secDesc}>Usada em botões, links, seleção e no item ativo do menu.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                title={a.name}
                onClick={() => pickAccent(a.hex)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: a.hex,
                  cursor: "pointer",
                  border: "none",
                  outline: accent === a.hex ? "2px solid var(--textPrimary)" : "1px solid var(--border)",
                  outlineOffset: 3,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {accent === a.hex ? <Icon name="check" size={16} color="#fff" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="ds-card" style={{ padding: 20 }}>
          <h2 style={secTitle}>Cores auxiliares</h2>
          <p style={secDesc}>Paleta dos badges e estados semânticos (sucesso, alerta, erro, promo).</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(AUX_PRESETS).map(([k, p]) => {
              const v = p.vars || { success: "#75C0C7", warning: "#A7863E", error: "#DE6B61", promo: "#B86BE8" };
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickAux(k)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 5,
                    border: "none",
                    cursor: "pointer",
                    background: aux === k ? "var(--backgroundContainerHover)" : "transparent",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    {(["success", "warning", "error", "promo"] as const).map((c) => (
                      <span key={c} style={{ width: 18, height: 18, borderRadius: 4, background: v[c] }} />
                    ))}
                  </span>
                  <span style={{ font: "400 14px/20px var(--fontFamily)", flex: 1 }}>{p.label}</span>
                  {aux === k ? <Icon name="check" size={16} color="var(--brand)" /> : null}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <span className="ds-badge" style={{ background: "var(--accent-success)", color: "var(--textButtonPrimary)" }}>
              processado
            </span>
            <span className="ds-badge" style={{ background: "var(--accent-warning)", color: "var(--textButtonPrimary)" }}>
              pendente
            </span>
            <span className="ds-badge" style={{ background: "var(--accent-error)", color: "var(--textButtonPrimary)" }}>
              erro
            </span>
            <span className="ds-badge" style={{ background: "var(--accent-promo)", color: "var(--textButtonPrimary)" }}>
              Qualificada
            </span>
          </div>
        </div>

        <div className="ds-card" style={{ padding: 20 }}>
          <h2 style={secTitle}>Fundo do sistema</h2>
          <p style={secDesc}>Tom geral da área de trabalho — frio ou quente.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {BGS.map((b) => (
              <button
                key={b.hex}
                type="button"
                title={b.name}
                onClick={() => pickBg(b.hex)}
                style={{
                  width: 56,
                  height: 36,
                  borderRadius: 5,
                  background: b.hex,
                  cursor: "pointer",
                  border: "none",
                  outline: bg === b.hex ? "2px solid var(--textPrimary)" : "1px solid var(--border)",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div className="ds-card" style={{ padding: 20 }}>
          <h2 style={secTitle}>Integrações</h2>
          <p style={{ ...secDesc, marginBottom: 12 }}>Conecte fontes para processar conversas automaticamente.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "400 14px/20px var(--fontFamily)" }}>
              <Icon name="cloud-upload" size={20} color="var(--textSecondary)" />
              Google Drive
            </span>
            <span className="ds-badge" style={{ background: "var(--accent-success)", color: "var(--textButtonPrimary)" }}>
              Conectado
            </span>
          </div>
          <N8nSection />
        </div>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
