"use client";
import { useState } from "react";
import { Button } from "@/components/ds";

/**
 * Botão "Sincronizar com Plaud": dispara POST /api/plaud/sync (varredura
 * completa + auto-processamento) e mostra o resumo do resultado.
 */
export function SyncPlaudButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/plaud/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na sincronização");
      const { ingest, processing } = json.data;
      setMsg(`Novas: ${ingest.created} · Atualizadas: ${ingest.updated} · Processadas: ${processing.processed}` +
        (processing.failed ? ` · Falhas IA: ${processing.failed}` : ""));
      onDone?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button onClick={run} disabled={busy}>
        {busy ? "Sincronizando…" : "Sincronizar com Plaud"}
      </Button>
      {msg ? (
        <span style={{ font: "400 12px/16px var(--font-sans)", color: "var(--color-muted-foreground)" }}>{msg}</span>
      ) : null}
    </span>
  );
}
