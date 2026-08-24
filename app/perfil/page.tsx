"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Input, Button } from "@/components/ds";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const PerfilPage = () => {
  const { data, mutate } = useSWR<{ data: { name: string; email: string; bio: string | null } }>(
    "/api/profile",
    fetcher
  );

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Hydrate form once the profile loads.
  useEffect(() => {
    if (data?.data) {
      setNome(data.data.name ?? "");
      setEmail(data.data.email ?? "");
      setBio(data.data.bio ?? "");
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, email, bio }),
      });
      if (!res.ok) throw new Error("save failed");
      const json = await res.json();
      mutate(json, false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: "0 0 20px" }}>Perfil</h1>
      <div className="ds-card" style={{ padding: 20, maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <span
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--brand)",
              color: "var(--textButtonPrimary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "500 22px/1 var(--fontFamily)",
              flexShrink: 0,
            }}
          >
            {(nome[0] || "A").toUpperCase()}
          </span>
          <div>
            <div style={{ font: "400 18px/24px var(--fontFamily)" }}>{nome || "—"}</div>
            <div style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--textSecondary)" }}>{email}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Nome" labelIcon="user-account" value={nome} onChange={setNome} />
          <Input label="E-mail" value={email} onChange={setEmail} type="email" />
          <div>
            <label className="ds-label">Sobre você (alimenta o Clone)</label>
            <textarea
              className="ds-input"
              style={{ resize: "vertical", minHeight: 72, fontFamily: "var(--fontFamily)" }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button icon="check" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            {saved ? (
              <span style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--accent-success)" }}>
                Alterações salvas.
              </span>
            ) : error ? (
              <span style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--accent-error)" }}>
                Erro ao salvar.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerfilPage;
