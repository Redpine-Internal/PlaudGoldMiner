"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Icon } from "@/components/ds";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        setError("E-mail ou senha inválidos.");
        return;
      }
      // Recarrega no servidor para o middleware enxergar a sessão nova.
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        color: "var(--textPrimary)",
        padding: 24,
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading && email && password) void handleSubmit();
        }}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "var(--surface, var(--background))",
          border: "1px solid var(--border, rgba(0,0,0,0.1))",
          borderRadius: 6,
          padding: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Icon name="brain" size={24} color="var(--brand)" />
          <span style={{ fontSize: 22, fontFamily: "var(--font-display)" }}>Plaud Gold Miner</span>
        </div>

        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="voce@empresa.com"
          required
        />
        <Input
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
        />

        {error ? (
          <span role="alert" style={{ color: "var(--accent-error, #C25E4C)", fontSize: 14 }}>
            {error}
          </span>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={loading || !email || !password}
          icon={loading ? "loader-circle" : undefined}
          iconSpin={loading}
        >
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
