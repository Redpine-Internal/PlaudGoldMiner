"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./login-page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"password" | "microsoft" | null>(null);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "access") {
      setError("Este usuário não possui acesso ao Plaud Gold Miner.");
    } else if (reason === "consent") {
      setError(
        "A EHS Brasil precisa autorizar o Plaud Gold Miner antes do primeiro acesso. Peça a liberação ao administrador do Microsoft 365.",
      );
    } else if (reason === "sso") {
      setError("Não foi possível entrar com a Microsoft. Tente novamente.");
    }
  }, []);

  const handleSubmit = async (credentials: {
    email: string;
    password: string;
  }) => {
    setError(null);
    setLoading("password");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });
      if (signInError) {
        setError("E-mail ou senha inválidos.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setError(null);
    setLoading("microsoft");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          scopes: "openid profile email",
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signInError) {
        setError("Não foi possível entrar com a Microsoft. Tente novamente.");
        setLoading(null);
      }
    } catch {
      setError("Não foi possível entrar com a Microsoft. Tente novamente.");
      setLoading(null);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-labelledby="login-manifesto">
        <div className={styles.wordmark} aria-label="Andreza Araújo">
          Andreza Araújo
        </div>

        <div className={styles.manifesto}>
          <span className={styles.accentLine} aria-hidden="true" />
          <h1 id="login-manifesto">
            Inteligência para uma cultura de segurança que{" "}
            <em>volta para casa</em>.
          </h1>
          <p>
            Sistema executivo de escutas, diagnósticos e pipeline de
            transformação cultural. Acesso restrito a organizações clientes.
          </p>
        </div>

        <footer className={styles.brandFooter}>
          <span>ACS Global Ventures · Sistema executivo</span>
          <span>v4.2</span>
        </footer>
      </section>

      <section className={styles.formPanel} aria-labelledby="login-title">
        <form
          className={styles.form}
          // Defesa em profundidade: o submit é tratado em JS (preventDefault).
          // Se a hidratação falhar, o navegador faz o envio nativo — com method
          // GET (padrão) a senha iria na query string, para o histórico e os
          // logs. POST mantém as credenciais no corpo da requisição.
          method="post"
          aria-busy={loading !== null}
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (!loading) {
              void handleSubmit({
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
              });
            }
          }}
        >
          <p className={styles.eyebrow}>Acesso</p>
          <h2 id="login-title">Entrar no sistema</h2>

          <div className={styles.field}>
            <label htmlFor="login-email">
              E-mail corporativo <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu.nome@empresa.com.br"
              disabled={loading !== null}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="login-password">
              Senha <span aria-hidden="true">*</span>
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              disabled={loading !== null}
              required
            />
          </div>

          <div className={styles.sessionOptions}>
            <a
              href="mailto:contato@andrezaaraujo.com?subject=Recuperação%20de%20acesso"
              className={styles.forgotPassword}
            >
              Esqueci a senha
            </a>
          </div>

          {error ? (
            <p role="alert" className={styles.errorMessage}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={loading !== null}
          >
            <span>{loading === "password" ? "Entrando…" : "Entrar"}</span>
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            className={styles.ssoButton}
            disabled={loading !== null}
            onClick={() => void handleMicrosoftSignIn()}
          >
            {loading === "microsoft"
              ? "Abrindo SSO…"
              : "Entrar com SSO da organização"}
          </button>

          <p className={styles.legal}>
            Ao entrar você concorda com os termos de uso e a política de
            privacidade. Dados de escuta são confidenciais e auditados.
            <span>andrezaaraujo.com · contato@andrezaaraujo.com</span>
          </p>
        </form>
      </section>
    </main>
  );
}
