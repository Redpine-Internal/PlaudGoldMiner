"use client";
import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAppStore, type CloneMsg } from "@/stores/appStore";
import { Icon, Markdown } from "@/components/ds";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fetchJson } from "@/lib/http";
import { createCloneStream, regenerationHistory, replaceCloneReply, type CloneMessage } from "@/lib/clone/chat-stream";

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
const fetcher = fetchJson;

interface CloneData {
  conversations: number;
  opportunities: number;
  contents: number;
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 4,
  cursor: "pointer",
  color: "var(--textSecondary)",
  display: "inline-flex",
  borderRadius: 5,
  minHeight: 44,
};

const suggestions = ["O que aprendi essa semana?", "Quais negócios priorizar?", "Ideias de conteúdo sobre delegação"];
const HISTORY_LABEL = "Histórico desta sessão";

const ClonePage = () => {
  const { chats, activeChatId, saveChatMsgs, newChat, selectChat } = useAppStore();
  const isMobile = useIsMobile();
  const chat = chats.find((c) => c.id === activeChatId) || chats[0];

  const { data: convData } = useSWR<{ data: unknown[]; total: number }>("/api/conversations?limit=1", fetcher);
  const { data: oppData } = useSWR<{ data: Opportunity[]; total: number }>("/api/opportunities?limit=1", fetcher);
  const { data: ctData } = useSWR<{ data: Content[]; total: number }>("/api/contents?limit=1", fetcher);

  const data: CloneData = {
    conversations: convData?.total ?? convData?.data.length ?? 0,
    opportunities: oppData?.total ?? oppData?.data.length ?? 0,
    contents: ctData?.total ?? ctData?.data.length ?? 0,
  };
  const dataReady = convData !== undefined && oppData !== undefined && ctData !== undefined;

  return (
    <div className="pgm-clone-layout">
      <aside className="pgm-clone-history" aria-label={HISTORY_LABEL}>
        <button type="button" className="pgm-clone-history__new" onClick={() => newChat()}>Novo chat →</button>
        <p>{HISTORY_LABEL}</p>
        <div className="pgm-clone-history__list">
          {chats.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === activeChatId} onClick={() => selectChat(item.id)} title={item.title}>
              {item.title}
            </button>
          ))}
        </div>
        <Link href="/configuracoes">Configurações</Link>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
        {isMobile ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12 }}>
          <label style={{ flex: 1, minWidth: 0 }}>
            <span className="sr-only">{HISTORY_LABEL}</span>
            <select className="ds-input" value={activeChatId} onChange={(event) => selectChat(Number(event.target.value))}>
              {chats.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <button type="button" className="ds-btn ds-btn--outline" onClick={() => newChat()}>Novo chat</button>
        </div> : null}
        <CloneChat key={chat.id} data={data} dataReady={dataReady} chat={chat} onMsgs={saveChatMsgs} />
      </div>
    </div>
  );
};

function CloneChat({
  data,
  dataReady,
  chat,
  onMsgs,
}: {
  data: CloneData;
  dataReady: boolean;
  chat: { id: number; seed: string | null; msgs: CloneMsg[] | null };
  onMsgs: (id: number, msgs: CloneMsg[], autoTitle?: string) => void;
}) {
  const greetingText = dataReady ?
    "Oi! Eu sou o Plaud Gold Miner! Sua base tem " +
    data.conversations +
    " conversas, " +
    data.opportunities +
    " novos negócios e " +
    data.contents +
    " sugestões de conteúdo. O que você quer explorar?" : "Oi! Eu sou o Plaud Gold Miner! Posso consultar suas conversas e ideias. O que você quer explorar?";
  const greeting: CloneMessage = {
    id: `greeting-${chat.id}`,
    role: "clone",
    text: greetingText,
  };
  const [msgs, setMsgs] = useState<CloneMessage[]>(() => chat.msgs?.map((message, index) => ({
    ...message,
    id: typeof (message as Partial<CloneMessage>).id === "string" ? (message as CloneMessage).id : `${chat.id}-${index}`,
  })) || [greeting]);
  const seeded = useRef(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const stream = useRef(createCloneStream());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentStream = stream.current;
    return () => currentStream.cancel();
  }, []);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight;
  }, [msgs, thinking]);

  useEffect(() => {
    const isUntouchedGreeting = !chat.msgs && msgs.length === 1 && msgs[0]?.role === "clone";
    if (!dataReady || !isUntouchedGreeting || msgs[0].text === greetingText) return;
    setMsgs([{ id: `greeting-${chat.id}`, role: "clone", text: greetingText }]);
  }, [chat.id, chat.msgs, dataReady, greetingText, msgs]);

  useEffect(() => {
    if (onMsgs && msgs.length > 1) {
      const firstUser = msgs.find((m) => m.role === "user");
      onMsgs(chat.id, msgs, firstUser ? firstUser.text.slice(0, 40) : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  const ask = async (history: CloneMsg[], replyId: string) => {
    if (stream.current.pending) return;
    setStreaming(true);
    setReplyError(null);
    setActionNotice("");
    setThinking("Consultando a base de conhecimento...");
    try {
      await stream.current.run(history, (text) => {
        setThinking(null);
        setMsgs((current) => replaceCloneReply(current, replyId, text));
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      const text = e instanceof Error ? e.message : "Falha ao consultar o Clone.";
      setReplyError(text);
      setMsgs((current) => current.map((message) => message.id === replyId && !message.text ? { ...message, text: "Resposta indisponível. Use Regenerar para tentar novamente." } : message));
    } finally {
      setThinking(null);
      setStreaming(false);
    }
  };

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || stream.current.pending) return;
    setInput("");
    const history: CloneMessage[] = [...msgs, { id: crypto.randomUUID(), role: "user", text: q }];
    const replyId = crypto.randomUUID();
    setMsgs([...history, { id: replyId, role: "clone", text: "" }]);
    void ask(history, replyId);
  };

  const regenerate = (id: string) => {
    if (stream.current.pending) return;
    const history = regenerationHistory(msgs, id);
    if (history) void ask(history, id);
  };

  const copy = async (message: CloneMessage) => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(message.text);
      setActionNotice("Resposta copiada.");
    } catch {
      setActionNotice("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const toggleUseful = (id: string) => {
    const useful = !msgs.find((message) => message.id === id)?.useful;
    setMsgs((current) => current.map((message) => message.id === id ? { ...message, useful } : message));
    setActionNotice(useful ? "Resposta marcada como útil neste chat." : "Marcação removida deste chat.");
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
      <p style={{ margin: 0, fontSize: 13, color: "var(--textSecondary)" }}>
        O histórico é mantido enquanto você navega. Recarregar ou fechar a página apaga estas conversas do chat.
      </p>
      <div className="pgm-clone-chat__rule" />
      <div className="pgm-clone-chat__body">
        <div ref={endRef} className="pgm-clone-messages" aria-label="Mensagens do Clone" aria-busy={streaming}>
          {msgs.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
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
              <div key={m.id} className="pgm-clone-message">
                <span>Clone</span>
                <div>
                  <div className="[&_ul]:list-disc [&_ol]:list-decimal">
                    <Markdown>{m.text}</Markdown>
                  </div>
                  <div className="pgm-clone-message__actions" style={{ flexWrap: "wrap", gap: 8 }}>
                    <button type="button" title="Copiar" style={iconBtn} disabled={!m.text} onClick={() => void copy(m)}><Icon name="copy" size={15} />Copiar</button>
                    <button type="button" title="Marcar como útil neste chat" style={iconBtn} disabled={streaming || !m.text} aria-pressed={!!m.useful} onClick={() => toggleUseful(m.id)}><Icon name="thumb-up" size={15} />{m.useful ? "Marcado como útil" : "Útil"}</button>
                    {regenerationHistory(msgs, m.id) ? <button type="button" title="Regenerar esta resposta" style={iconBtn} disabled={streaming} onClick={() => regenerate(m.id)}><Icon name="reload" size={15} />Regenerar</button> : null}
                  </div>
                </div>
              </div>
            )
          )}
          {thinking ? (
            <div role="status" style={{ alignSelf: "flex-start", display: "flex", gap: 8, alignItems: "center" }}>
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
        {replyError ? <p role="alert" style={{ color: "var(--accent-error)", margin: "8px 0" }}>{replyError}</p> : null}
        <span role="status" style={{ fontSize: 13, color: "var(--textSecondary)" }}>{actionNotice || (streaming && !thinking ? "Recebendo resposta..." : "")}</span>
        <div className="pgm-clone-composer">
          <div className="pgm-clone-modes" role="group" aria-label="Modo do assistente">
            <button type="button" aria-pressed="true">Clone</button>
            <button type="button" onClick={consultarBase} disabled={streaming}>Consultar base</button>
            <button type="button" onClick={gerarInsights} disabled={streaming}>Gerar insights</button>
          </div>
          <input
            className="ds-input"
            value={input}
            placeholder="Pergunte ao seu Clone..."
            aria-label="Pergunta para o Clone"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
            }}
          />
          <button type="button" className="pgm-clone-send" title="Enviar" onClick={() => send()} disabled={!input.trim() || streaming}>
            Enviar →
          </button>
        </div>
      </div>
    </section>
  );
}

export default ClonePage;
