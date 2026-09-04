"use client";
import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAppStore, type CloneMsg } from "@/stores/appStore";
import { Icon } from "@/components/ds";

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
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CloneData {
  conversations: unknown[];
  opportunities: Opportunity[];
  contents: Content[];
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

const suggestions = ["O que aprendi essa semana?", "Quais negócios priorizar?", "Ideias de conteúdo sobre delegação"];

const ClonePage = () => {
  const { chats, activeChatId, saveChatMsgs, newChat, selectChat } = useAppStore();
  const chat = chats.find((c) => c.id === activeChatId) || chats[0];

  const { data: convData } = useSWR<{ data: unknown[]; total: number }>("/api/conversations?limit=100", fetcher);
  const { data: oppData } = useSWR<{ data: Opportunity[] }>("/api/opportunities?limit=100", fetcher);
  const { data: ctData } = useSWR<{ data: Content[] }>("/api/contents?limit=100", fetcher);

  const data: CloneData = {
    conversations: convData?.data || [],
    opportunities: oppData?.data || [],
    contents: ctData?.data || [],
  };

  return (
    <div className="pgm-clone-layout">
      <aside className="pgm-clone-history" aria-label="Histórico do Clone">
        <button type="button" className="pgm-clone-history__new" onClick={() => newChat()}>Novo chat →</button>
        <p>Histórico</p>
        <div className="pgm-clone-history__list">
          {chats.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === activeChatId} onClick={() => selectChat(item.id)} title={item.title}>
              {item.title}
            </button>
          ))}
        </div>
        <Link href="/configuracoes">Configurações</Link>
      </aside>
      <CloneChat key={chat.id} data={data} chat={chat} onMsgs={saveChatMsgs} />
    </div>
  );
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
      "Oi! Eu sou o Plaud Gold Miner! Aprendi com " +
      data.conversations.length +
      " conversas, " +
      data.opportunities.length +
      " novos negócios e " +
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

  const consultarBase = () => send("Faça um panorama da minha base: quantas conversas, novos negócios e conteúdos tenho, e quais os temas mais fortes.");

  const gerarInsights = () => send("Analise minhas conversas e me dê um insight cruzado relevante, com um próximo passo prático.");

  return (
    <section className="pgm-clone-chat">
      <h1>Clone</h1>
      <div className="pgm-clone-chat__rule" />
      <div className="pgm-clone-chat__body">
        <div ref={endRef} className="pgm-clone-messages">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "70%",
                  background: "var(--backgroundContainer)",
                  color: "var(--textPrimary)",
                  borderRadius: 6,
                  padding: "12px 16px",
                  font: "400 14px/21px var(--fontFamily)",
                }}
              >
                {m.text}
              </div>
            ) : (
              <div key={i} className="pgm-clone-message">
                <span>Clone</span>
                <div>
                  <p>{m.text}</p>
                  <div className="pgm-clone-message__actions">
                    <button type="button" title="Copiar" style={iconBtn} onClick={() => navigator.clipboard?.writeText(m.text)}><Icon name="copy" size={15} />Copiar</button>
                    <button type="button" title="Útil" style={iconBtn}><Icon name="thumb-up" size={15} />Útil</button>
                    <button type="button" title="Regenerar" style={iconBtn}><Icon name="reload" size={15} />Regenerar</button>
                  </div>
                </div>
              </div>
            )
          )}
          {thinking ? (
            <div style={{ alignSelf: "flex-start", display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="reload" size={14} color="var(--textSecondary)" className="ds-spin" />
              <span style={{ font: "400 13px/18px var(--fontFamily)", color: "var(--textSecondary)" }}>{thinking}</span>
            </div>
          ) : null}
          {msgs.length <= 1 ? (
          <div className="pgm-clone-suggestions">
            {suggestions.map((sg) => (
              <button key={sg} type="button" className="ds-chip" onClick={() => send(sg)}>
                {sg}
              </button>
            ))}
          </div>
          ) : null}
        </div>
        <div className="pgm-clone-composer">
          <div className="pgm-clone-modes" role="group" aria-label="Modo do assistente">
            <button type="button" aria-pressed="true">Clone</button>
            <button type="button" onClick={consultarBase} disabled={!!thinking}>Consultar base</button>
            <button type="button" onClick={gerarInsights} disabled={!!thinking}>Gerar insights</button>
          </div>
          <input
            className="ds-input"
            value={input}
            placeholder="Pergunte ao seu Clone..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button type="button" className="pgm-clone-send" title="Enviar" onClick={() => send()} disabled={!input.trim() || !!thinking}>
            Enviar →
          </button>
        </div>
      </div>
    </section>
  );
}

export default ClonePage;
