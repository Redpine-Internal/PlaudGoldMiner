"use client";

import { useState } from "react";
import {
  CONVERSATION_CLASSIFICATIONS,
  isMiningEligibleConversationType,
  type ConversationType,
} from "@/lib/conversations/classification";

interface ConversationTypeSelectProps {
  conversationId: string;
  value: ConversationType;
  onSaved?: (type: ConversationType) => void;
  compact?: boolean;
}

export function ConversationTypeSelect({ conversationId, value, onSaved, compact = false }: ConversationTypeSelectProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (nextType: ConversationType) => {
    if (nextType === value || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: nextType }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Não foi possível salvar a classificação.");
      }
      onSaved?.(nextType);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a classificação.");
    } finally {
      setSaving(false);
    }
  };

  const eligible = isMiningEligibleConversationType(value);
  return (
    <span
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{ display: "inline-flex", flexDirection: "column", gap: 3, minWidth: compact ? 135 : 230, maxWidth: "100%" }}
    >
      <select
        className="ds-input"
        aria-label="Classificar gravação"
        value={value}
        disabled={saving}
        onChange={(event) => void save(event.target.value as ConversationType)}
        title={eligible ? "Esta gravação entra na mineração" : "Esta gravação não entra na mineração"}
        style={{ minHeight: compact ? 34 : 40, width: "100%", padding: compact ? "5px 28px 5px 8px" : undefined }}
      >
        {CONVERSATION_CLASSIFICATIONS.map((classification) => (
          <option key={classification.value} value={classification.value}>
            {classification.label}{classification.miningEligible ? " · entra na mineração" : " · fora da mineração"}
          </option>
        ))}
      </select>
      {error ? <small role="alert" style={{ color: "var(--accent-error)" }}>{error}</small> : null}
    </span>
  );
}
