import type { CloneMsg } from '@/stores/appStore';

export type CloneMessage = CloneMsg & { id: string; useful?: boolean };

/** Update the intended answer even if the surrounding history changes. */
export function replaceCloneReply(messages: CloneMessage[], id: string, text: string): CloneMessage[] {
  return messages.map((message) => message.id === id ? { ...message, text, useful: false } : message);
}

/** A regenerated answer uses the context through its own question, not later turns. */
export function regenerationHistory(messages: CloneMessage[], id: string): CloneMsg[] | null {
  const replyIndex = messages.findIndex((message) => message.id === id && message.role === 'clone');
  for (let index = replyIndex - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      return messages.slice(0, index + 1).map(({ role, text }) => ({ role, text }));
    }
  }
  return null;
}

/** One request owns the stream until it ends, including after its first token. */
export function createCloneStream() {
  let active: AbortController | null = null;
  return {
    get pending() { return active !== null; },
    cancel() { active?.abort(); },
    async run(messages: CloneMsg[], onText: (text: string) => void): Promise<boolean> {
      if (active) return false;
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch('/api/clone/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messages.map(({ role, text }) => ({ role, text })) }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Não foi possível consultar o Clone. Tente novamente.');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        try {
          for (;;) {
            const { value, done } = await reader.read();
            controller.signal.throwIfAborted();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            if (text) onText(text);
          }
          text += decoder.decode();
          if (!text.trim()) throw new Error('Não consegui gerar uma resposta agora. Tente novamente.');
          onText(text);
        } finally {
          reader.releaseLock();
        }
        return true;
      } finally {
        active = null;
      }
    },
  };
}
