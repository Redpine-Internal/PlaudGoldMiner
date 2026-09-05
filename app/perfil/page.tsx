"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Input, Button } from "@/components/ds";
import { fetchJson } from "@/lib/http";

const fetcher = (url: string) => fetchJson<{ data: { name: string; email: string; bio: string | null } }>(url);

const DEFAULT_PROFILE = {
  name: "Fabio Marques",
  email: "fabio.marques@ehsbrasil.com",
  bio: "Atuação em segurança do trabalho com foco em prevenção de eventos graves, leitura de energia e controles críticos. Trabalho com liderança de primeira linha e com a diferença entre cumprir norma e controlar risco.",
};

const PerfilPage = () => {
  const { data, mutate, error: loadError, isLoading } = useSWR<{ data: { name: string; email: string; bio: string | null } }>(
    "/api/profile",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Hydrate form once the profile loads.
  useEffect(() => {
    if (data?.data) {
      setNome(data.data.name?.trim() || DEFAULT_PROFILE.name);
      setEmail(data.data.email?.trim() || DEFAULT_PROFILE.email);
      setBio(data.data.bio ?? "");
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, email, bio }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar o perfil.");
      mutate(json, false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o perfil.");
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
      {loadError ? <div role="alert"><p>Não foi possível carregar o perfil.</p><Button variant="outline" onClick={() => void mutate()}>Tentar novamente</Button></div> : null}
      {isLoading ? <p role="status">Carregando perfil...</p> : null}

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
          <Input disabled={isLoading || saving || Boolean(loadError)} className="pgm-profile-field__control" label="Nome" labelIcon="user-account" value={nome} onChange={setNome} />
        </div>
        <div className="pgm-profile-field">
          <div className="pgm-profile-field__label">
            <strong>E-mail</strong>
            <span>E-mail de contato do perfil. Não altera o e-mail de acesso à conta.</span>
          </div>
          <Input disabled={isLoading || saving || Boolean(loadError)} className="pgm-profile-field__control" label="E-mail" value={email} onChange={setEmail} type="email" />
        </div>
        <div className="pgm-profile-field">
          <div className="pgm-profile-field__label">
            <strong>Sobre você</strong>
            <span>Contexto que ajuda o Clone a responder com mais precisão.</span>
          </div>
          <div className="pgm-profile-field__control">
            <label htmlFor="profile-bio" className="ds-label">Sobre você (alimenta o Clone)</label>
            <textarea
              disabled={isLoading || saving || Boolean(loadError)}
              id="profile-bio"
              className="ds-input"
              style={{ resize: "vertical", minHeight: 112, fontFamily: "var(--fontFamily)" }}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>
        <div className="pgm-profile-actions">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Button icon="check" onClick={save} disabled={saving || isLoading || Boolean(loadError) || !nome.trim() || !email.trim()}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
            {saved ? (
              <span role="status" style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--accent-success)" }}>
                Alterações salvas.
              </span>
            ) : error ? (
              <span role="alert" style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--accent-error)" }}>
                {error}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PerfilPage;
