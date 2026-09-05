"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon, Button } from "@/components/ds";
import { signIn, signOut } from "next-auth/react";
import { ApiError, fetchJson } from "@/lib/http";
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

const secTitle: React.CSSProperties = { font: "400 24px/30px var(--font-display)", margin: 0 };
const secDesc: React.CSSProperties = { margin: "4px 0 0", font: "400 12px/18px var(--fontFamily)", color: "var(--textSecondary)" };

interface N8nHealth {
  configured: boolean;
  reachable: boolean;
  authOk?: boolean;
  baseUrl: string;
}

function IntegrationStatus() {
  const [n8n, setN8n] = useState<N8nHealth | null>(null);
  const [drive, setDrive] = useState<"connected" | "disconnected" | "error" | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const check = useCallback(async () => {
    return Promise.all([
      fetchJson<{ data: N8nHealth }>("/api/n8n/status")
        .then((result) => setN8n(result.data))
        .catch(() => { setN8n(null); setError("Não foi possível verificar o n8n."); }),
      fetchJson("/api/drive/folders?pageSize=1")
        .then(() => setDrive("connected"))
        .catch((failure: unknown) => setDrive(failure instanceof ApiError && failure.status === 401 ? "disconnected" : "error")),
    ]).finally(() => setChecking(false));
  }, []);

  useEffect(() => { void check(); }, [check]);
  const n8nLabel = !n8n ? "Estado não confirmado" : !n8n.configured ? "Não configurado" : !n8n.reachable ? "Indisponível" : n8n.authOk === true ? "Conexão verificada" : n8n.authOk === false ? "Autenticação recusada" : "Autenticação não confirmada";
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span><Icon name="cloud-upload" size={20} /> Google Drive</span>
        <span role="status">{checking ? "Verificando..." : drive === "connected" ? "Conectado" : drive === "disconnected" ? "Não conectado" : "Falha na verificação"}</span>
        {!checking && drive !== "connected" ? <Button size="sm" variant="outline" onClick={() => void signIn("google", { callbackUrl: "/configuracoes" }).catch(() => setError("Não foi possível abrir a conexão com o Google."))}>Conectar Google Drive</Button> : null}
        {!checking && drive === "connected" ? <Button size="sm" variant="outline" onClick={() => {
          setChecking(true);
          void signOut({ redirect: false }).then(() => check()).catch(() => { setError("Não foi possível desconectar o Google Drive."); setChecking(false); });
        }}>Desconectar Google Drive</Button> : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span><Icon name="controls" size={20} /> n8n · automações</span>
        <span role="status">{checking ? "Verificando..." : n8nLabel}</span>
      </div>
      {n8n ? <div style={{ overflowWrap: "anywhere" }}><p style={secDesc}>URL da instância: {n8n.baseUrl}</p><p style={secDesc}>Chave do webhook: {n8n.configured ? "Configurada no servidor (oculta)" : "Não configurada"}</p></div> : null}
      <p style={secDesc}>O n8n é configurado no servidor. Esta verificação consulta a conexão e a autenticação, não confirma a execução de cada automação. Para alterar ou remover a integração, solicite a atualização da configuração do servidor.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div><Button variant="outline" size="sm" icon="reload" disabled={checking} onClick={() => { setChecking(true); setError(""); void check(); }}>{checking ? "Verificando conexões..." : "Verificar conexões"}</Button></div>
    </div>
  );
}

const ConfiguracoesPage = () => {
  const [accent, setAccent] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY_ACCENT);
      return ACCENTS.some((item) => item.hex === saved) ? saved! : "#A6D7F0";
    } catch {
      return "#A6D7F0";
    }
  });
  const [aux, setAux] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY_AUX);
      return saved && AUX_PRESETS[saved] ? saved : "corporativa";
    } catch {
      return "corporativa";
    }
  });
  const [bg, setBg] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY_BG);
      return BGS.some((item) => item.hex === saved) ? saved! : "#FFFFFF";
    } catch {
      return "#FFFFFF";
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
    <div className="pgm-settings-page">
      <header className="pgm-settings-hero">
        <p className="pgm-page-eyebrow">Sistema e integrações</p>
        <h1>Configurações</h1>
      </header>
      <div className="pgm-settings-sections">
        <section className="ds-card pgm-settings-section">
          <div><h2 style={secTitle}>Cor principal</h2><p style={secDesc}>Usada em botões, links, seleção e no item ativo do menu.</p></div>
          <div className="pgm-settings-controls" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                className="pgm-swatch"
                title={a.name}
                onClick={() => pickAccent(a.hex)}
                style={{
                  borderRadius: 4,
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
        </section>

        <section className="ds-card pgm-settings-section">
          <div><h2 style={secTitle}>Cores auxiliares</h2><p style={secDesc}>Paleta dos badges e estados semânticos (sucesso, alerta, erro, promoção).</p></div>
          <div className="pgm-settings-controls">
          <div className="pgm-settings-presets">
            {Object.entries(AUX_PRESETS).map(([k, p]) => {
              const v = p.vars || { success: "#2F6F4E", warning: "#8B5A28", error: "#963E35", promo: "#5F401F" };
              return (
                <button
                  key={k}
                  type="button"
                  className="pgm-preset-button"
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
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span className="ds-badge" style={{ background: "var(--badge-bg)", color: "var(--accent-success)" }}>
              Processado
            </span>
            <span className="ds-badge" style={{ background: "var(--badge-bg)", color: "var(--accent-warning)" }}>
              Pendente
            </span>
            <span className="ds-badge" style={{ background: "var(--badge-bg)", color: "var(--accent-error)" }}>
              Erro
            </span>
            <span className="ds-badge" style={{ background: "var(--badge-bg)", color: "var(--accent-promo)" }}>
              Qualificada
            </span>
          </div>
          </div>
        </section>

        <section className="ds-card pgm-settings-section">
          <div><h2 style={secTitle}>Fundo do sistema</h2><p style={secDesc}>Tom geral da área de trabalho: frio ou quente.</p></div>
          <div className="pgm-settings-controls" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {BGS.map((b) => (
              <button
                key={b.hex}
                type="button"
                className="pgm-swatch pgm-swatch--wide"
                title={b.name}
                onClick={() => pickBg(b.hex)}
                style={{
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
        </section>

        <section className="ds-card pgm-settings-section">
          <div><h2 style={secTitle}>Integrações</h2><p style={secDesc}>Conecte fontes para processar conversas automaticamente.</p></div>
          <div className="pgm-settings-controls">
          <IntegrationStatus />
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
