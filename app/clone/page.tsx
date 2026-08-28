"use client";
import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { useAppStore, type CloneMsg } from "@/stores/appStore";
import { Icon, Button } from "@/components/ds";

interface Opportunity {
  id: string;
  title: string;
  pain: string;
  score: number;
}
interface Content {
  id: string;
  title: string;
  relevanceScore: number;
}
interface CrossInsight {
  id: string;
  title: string;
  description: string;
  actionSuggestion: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CloneData {
  conversations: unknown[];
  opportunities: Opportunity[];
  contents: Content[];
  insights: CrossInsight[];
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 4,
  cursor: "pointer",
  color: "var(--textSecondary)",
  display: "inline-flex",
  borderRadius: 5,
};

const suggestions = ["O que aprendi essa semana?", "Quais oportunidades priorizar?", "Ideias de conteúdo sobre delegação"];

const ClonePage = () => {
  const { chats, activeChatId, saveChatMsgs } = useAppStore();
  const chat = chats.find((c) => c.id === activeChatId) || chats[0];

  const { data: convData } = useSWR<{ data: unknown[]; total: number }>("/api/conversations?limit=100", fetcher);
  const { data: oppData } = useSWR<{ data: Opportunity[] }>("/api/opportunities?limit=100", fetcher);
  const { data: ctData } = useSWR<{ data: Content[] }>("/api/contents?limit=100", fetcher);
  const { data: insData } = useSWR<{ data: CrossInsight[] }>("/api/insights?limit=10", fetcher);

  const data: CloneData = {
    conversations: convData?.data || [],
    opportunities: oppData?.data || [],
    contents: ctData?.data || [],
    insights: insData?.data || [],
  };

  return <CloneChat key={chat.id} data={data} chat={chat} onMsgs={saveChatMsgs} />;
};

function CloneChat({
  data,
  chat,
  onMsgs,
}: {
  data: CloneData;
  chat: { id: number; seed: string | null; msgs: CloneMsg[] | null };
  onMsgs: (id: number, msgs: CloneMsg[], autoTitle?: string) => void;
}) {
  const greeting: CloneMsg = {
    role: "clone",
    text:
      "Oi! Eu sou o seu Clone — aprendi com " +
      data.conversations.length +
      " conversas, " +
      data.opportunities.length +
      " oportunidades e " +
      data.contents.length +
      " sugestões de conteúdo. O que você quer explorar?",
  };
  const [msgs, setMsgs] = useState<CloneMsg[]>(chat.msgs || [greeting]);
  const seeded = useRef(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight;
  }, [msgs, thinking]);

  useEffect(() => {
    if (onMsgs && msgs.length > 1) {
      const firstUser = msgs.find((m) => m.role === "user");
      onMsgs(chat.id, msgs, firstUser ? firstUser.text.slice(0, 40) : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  // Real Clone: stream a grounded answer from Azure via /api/clone/chat.
  // `history` is the conversation to send (the user turn is already appended by
  // the caller). Streams tokens into a single growing clone message.
  const ask = async (history: CloneMsg[]) => {
    setThinking("Consultando a base de conhecimento...");
    try {
      const res = await fetch("/api/clone/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Falha ao consultar o Clone.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let started = false;

      // Insert the (empty) clone message on the first token, then keep updating it.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setThinking(null);
          setMsgs((p) => [...p, { role: "clone", text: acc }]);
        } else {
          setMsgs((p) => {
            const next = [...p];
            next[next.length - 1] = { role: "clone", text: acc };
            return next;
          });
        }
      }

      if (!started) {
        // No tokens streamed — surface an honest empty state.
        setThinking(null);
        setMsgs((p) => [...p, { role: "clone", text: "Não consegui gerar uma resposta agora. Tente novamente." }]);
      }
    } catch (e) {
      setThinking(null);
      const text = e instanceof Error ? e.message : "Falha ao consultar o Clone.";
      setMsgs((p) => [...p, { role: "clone", text }]);
    }
  };

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    const history: CloneMsg[] = [...msgs, { role: "user", text: q }];
    setMsgs(history);
    void ask(history);
  };

  useEffect(() => {
    if (chat.seed && !chat.msgs && !seeded.current) {
      seeded.current = true;
      send(chat.seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consultarBase = () => send("Faça um panorama da minha base: quantas conversas, oportunidades e conteúdos tenho, e quais os temas mais fortes.");

  const gerarInsights = () => send("Analise minhas conversas e me dê um insight cruzado relevante, com um próximo passo prático.");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      <h1 style={{ font: "400 28px/32px var(--fontFamily)", margin: "0 0 16px" }}>Clone</h1>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <div ref={endRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "70%",
                  background: "var(--backgroundContainer)",
                  color: "var(--textPrimary)",
                  borderRadius: "12px 12px 2px 12px",
                  padding: "12px 16px",
                  font: "400 14px/21px var(--fontFamily)",
                }}
              >
                {m.text}
              </div>
            ) : (
              <div key={i} style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                <div style={{ font: "400 15px/24px var(--fontFamily)", color: "var(--textPrimary)" }}>{m.text}</div>
                {i > 0 ? (
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button type="button" title="Copiar" style={iconBtn} onClick={() => navigator.clipboard?.writeText(m.text)}>
                      <Icon name="copy" size={15} />
                    </button>
                    <button type="button" title="Útil" style={iconBtn}>
                      <Icon name="thumb-up" size={15} />
                    </button>
                    <button type="button" title="Regenerar" style={iconBtn}>
                      <Icon name="reload" size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          )}
          {thinking ? (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="reload" size={14} color="var(--textSecondary)" className="ds-spin" />
              <span style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--textSecondary)" }}>{thinking}</span>
            </div>
          ) : null}
        </div>
        {msgs.length <= 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, justifyContent: "center" }}>
            {suggestions.map((sg) => (
              <button key={sg} type="button" className="ds-chip" onClick={() => send(sg)}>
                {sg}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ background: "var(--backgroundContainer)", borderRadius: 12, padding: "8px 8px 8px 16px" }}>
          <input
            className="ds-input"
            style={{ border: "none", boxShadow: "none", background: "transparent", padding: "8px 0", font: "400 15px/22px var(--fontFamily)", width: "100%" }}
            value={input}
            placeholder="Pergunte ao seu Clone..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "500 13px/18px var(--fontFamily)", color: "var(--textPrimary)" }}>
              <Icon name="ai" size={16} color="var(--brand)" />
              Clone
            </span>
            <Button variant="outline" size="sm" icon="brain" onClick={consultarBase} disabled={!!thinking} style={{ background: "var(--background)" }}>
              Consultar base
            </Button>
            <Button variant="outline" size="sm" icon="lightbulb" onClick={gerarInsights} disabled={!!thinking} style={{ background: "var(--background)" }}>
              Gerar insights
            </Button>
            <button
              type="button"
              title="Enviar"
              onClick={() => send()}
              disabled={!input.trim() || !!thinking}
              style={{
                marginLeft: "auto",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                background: "var(--buttonPrimaryBackground)",
                color: "var(--textButtonPrimary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: !input.trim() || thinking ? 0.5 : 1,
              }}
            >
              <Icon name="chevron-up" size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClonePage;
