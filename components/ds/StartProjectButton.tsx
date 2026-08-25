"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";

export interface StartProjectButtonProps {
  /** 'opportunity' | 'insight' | 'content' */
  sourceType: "opportunity" | "insight" | "content";
  sourceId: string;
  /** título herdado da ideia para o novo projeto */
  title: string;
  /** descrição opcional herdada da ideia */
  description?: string | null;
  style?: React.CSSProperties;
}

/**
 * Botão "Iniciar Projeto" / "Abrir Projeto" para os cards de ideia.
 * No clique, verifica se já existe projeto para (sourceType, sourceId):
 * - existe  -> navega para /projetos/[id]
 * - não     -> cria o projeto e navega para /projetos/[id]
 * O estado (existe ou não) é resolvido no clique, evitando N fetches na lista.
 */
export function StartProjectButton({
  sourceType,
  sourceId,
  title,
  description,
  style,
}: StartProjectButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      // Já existe projeto para esta ideia?
      const params = new URLSearchParams({ sourceType, sourceId, limit: "1" });
      const existingRes = await fetch(`/api/projects?${params.toString()}`);
      if (existingRes.ok) {
        const existing = await existingRes.json();
        const found = existing?.data?.[0];
        if (found?.id) {
          router.push(`/projetos/${found.id}`);
          return;
        }
      }
      // Criar novo projeto.
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description ?? undefined, sourceType, sourceId }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        setError(body?.error || `Falha ao iniciar projeto (HTTP ${createRes.status}).`);
        return;
      }
      const created = await createRes.json();
      const id = created?.data?.id;
      if (!id) {
        setError("Projeto criado, mas sem id retornado.");
        return;
      }
      router.push(`/projetos/${id}`);
    } catch (err) {
      console.error("StartProjectButton failed:", err);
      setError("Não foi possível iniciar o projeto. Verifique a conexão.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, ...style }}>
      <Button
        variant="primary"
        size="sm"
        icon="layout-dashboard"
        iconSpin={busy}
        onClick={handle}
        disabled={busy}
        title="Criar um projeto a partir desta ideia"
        style={{ width: 148, minWidth: 148, flexShrink: 0 }}
      >
        {busy ? "Criando..." : "Criar Projeto"}
      </Button>
      {error ? (
        <span role="alert" style={{ font: "400 12px/16px var(--font-sans)", color: "var(--accent-error)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
