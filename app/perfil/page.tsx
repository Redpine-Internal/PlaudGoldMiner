"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Input, Button } from "@/components/ds";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const DEFAULT_PROFILE = {
  name: "Fabio Marques",
  email: "fabio.marques@ehsbrasil.com",
  bio: "Atuação em segurança do trabalho com foco em prevenção de eventos graves, leitura de energia e controles críticos. Trabalho com liderança de primeira linha e com a diferença entre cumprir norma e controlar risco.",
};

const PerfilPage = () => {
  const { data, mutate } = useSWR<{ data: { name: string; email: string; bio: string | null } }>(
    "/api/profile",
    fetcher
  );

  const [nome, setNome] = useState(DEFAULT_PROFILE.name);
  const [email, setEmail] = useState(DEFAULT_PROFILE.email);
  const [bio, setBio] = useState(DEFAULT_PROFILE.bio);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Hydrate form once the profile loads.
  useEffect(() => {
    if (data?.data) {
      setNome(data.data.name?.trim() || DEFAULT_PROFILE.name);
      setEmail(data.data.email?.trim() || DEFAULT_PROFILE.email);
      setBio(data.data.bio?.trim() || DEFAULT_PROFILE.bio);
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
    <div className="pgm-profile-page">
      <header className="pgm-profile-hero">
        <p className="pgm-page-eyebrow">Perfil</p>
        <h1>Perfil</h1>
      </header>

      <section className="pgm-profile-identity" aria-label="Identidade da conta">
        <span className="pgm-profile-avatar" aria-hidden>
            {(nome[0] || "A").toUpperCase()}
        </span>
        <div>
          <div className="pgm-profile-name">{nome || "Não informado"}</div>
          <div className="pgm-profile-email">{email || "E-mail não informado"}</div>
        </div>
      </section>

      <section className="pgm-profile-form" aria-label="Dados do perfil">
        <div className="pgm-profile-field">
          <div className="pgm-profile-field__label">
            <strong>Nome</strong>
            <span>Como você será identificado no sistema.</span>
          </div>
          <Input className="pgm-profile-field__control" label="Nome" labelIcon="user-account" value={nome} onChange={setNome} />
        </div>
        <div className="pgm-profile-field">
          <div className="pgm-profile-field__label">
            <strong>E-mail</strong>
            <span>Endereço usado para acesso e comunicações.</span>
          </div>
          <Input className="pgm-profile-field__control" label="E-mail" value={email} onChange={setEmail} type="email" />
        </div>
        <div className="pgm-profile-field">
          <div className="pgm-profile-field__label">
            <strong>Sobre você</strong>
            <span>Contexto que ajuda o Clone a responder com mais precisão.</span>
          </div>
          <div className="pgm-profile-field__control">
            <label className="ds-label">Sobre você (alimenta o Clone)</label>
            <textarea
              className="ds-input"
              style={{ resize: "vertical", minHeight: 112, fontFamily: "var(--fontFamily)" }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>
        <div className="pgm-profile-actions">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button icon="check" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
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
      </section>
    </div>
  );
};

export default PerfilPage;
