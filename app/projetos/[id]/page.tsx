"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState, Markdown } from "@/components/ds";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Task = { id: string; projectId: string; columnId: string; title: string; detail: string | null; kind: string; position: number; createdAt: string };
type Column = { id: string; projectId: string; name: string; position: number; createdAt: string };
type Board = { project: { id: string; title: string; description: string | null; status: string; sourceType: string; sourceId: string; createdAt: string }; columns: Column[]; tasks: Task[] };
type ApiResponse = { data: Board };

const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-background)", color: "var(--color-foreground)", font: "400 14px/20px var(--font-sans)" };

export default function ProjetoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(projectId ? `/api/projects/${projectId}` : null, fetcher, { revalidateOnFocus: false });
  const board = data?.data;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [columnName, setColumnName] = useState("");
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const request = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error || `Falha na operação (HTTP ${res.status}).`);
    }
    return res;
  };

  const saveProject = async () => {
    if (!board) return;
    try {
      await request(`/api/projects/${projectId}`, "PATCH", { title: title.trim() || board.project.title, description: description.trim() || null });
      setEditing(false);
      await mutate();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível salvar o projeto."); }
  };

  const generate = async (action: "aprofundar" | "plano" | "riscos" | "conteudo") => {
    setGenerating(action); setMessage(null);
    try { await request(`/api/projects/${projectId}/generate`, "POST", { action }); await mutate(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível gerar tarefas."); }
    finally { setGenerating(null); }
  };

  const addColumn = async () => {
    if (!columnName.trim()) return;
    try { await request(`/api/projects/${projectId}/columns`, "POST", { name: columnName }); setColumnName(""); await mutate(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível adicionar a coluna."); }
  };

  const addTask = async (columnId: string) => {
    const title = taskNames[columnId]?.trim();
    if (!title) return;
    try { await request(`/api/projects/${projectId}/tasks`, "POST", { columnId, title }); setTaskNames((current) => ({ ...current, [columnId]: "" })); await mutate(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível adicionar a tarefa."); }
  };

  if (isLoading || !board) return <div style={{ display: "flex", gap: 16, overflow: "hidden" }}>{[1, 2, 3].map((n) => <div key={n} style={{ minWidth: 280, height: 260, borderRadius: "var(--radius-lg)", background: "var(--color-sidebar)", border: "1px solid var(--color-border)" }} />)}</div>;

  const tasksFor = (columnId: string) => board.tasks.filter((task) => task.columnId === columnId);
  const actions: Array<["aprofundar" | "plano" | "riscos" | "conteudo", string]> = [["aprofundar", "Aprofundar"], ["plano", "Virar plano"], ["riscos", "Riscos & perguntas"], ["conteudo", "Gerar conteúdo"]];

  return <div>
    <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <Button variant="link" icon="arrow-left" onClick={() => router.push("/projetos")}>Projetos</Button>
        {editing ? <input aria-label="Título do projeto" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, marginTop: 8, font: "400 28px/32px var(--font-sans)" }} /> : <h1 style={{ font: "400 28px/32px var(--font-sans)", margin: "8px 0" }}>{board.project.title}</h1>}
        {editing ? <textarea aria-label="Descrição do projeto" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...fieldStyle, marginTop: 4, resize: "vertical" }} /> : board.project.description ? <p style={{ margin: 0, color: "var(--color-muted-foreground)", font: "400 14px/20px var(--font-sans)" }}>{board.project.description}</p> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ padding: "6px 10px", borderRadius: 5, background: "var(--type-informal-bg)", color: "var(--color-primary)", font: "500 13px/18px var(--font-sans)" }}>{board.project.status}</span>
        {editing ? <Button variant="primary" onClick={saveProject}>Salvar</Button> : <Button variant="outline" icon="square-pen" onClick={() => { setTitle(board.project.title); setDescription(board.project.description || ""); setEditing(true); }}>Editar</Button>}
      </div>
    </div>

    {message ? <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)", font: "400 13px/18px var(--font-sans)" }}>{message}</div> : null}
    {error ? <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>Erro ao carregar o projeto. Tente novamente.</div> : null}

    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
      {actions.map(([action, label]) => <Button key={action} variant="primary" icon="sparkles" iconSpin={generating === action} disabled={!!generating} onClick={() => generate(action)}>{generating === action ? "Gerando..." : label}</Button>)}
      <Button variant="outline" icon="refresh-cw" onClick={() => mutate()} title="Atualizar" />
    </div>

    {!board.columns.length ? <EmptyState icon="add-more" title="Nenhuma coluna" message="Adicione uma coluna para começar a organizar o projeto." /> : null}
    <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
      {board.columns.map((column) => {
        const tasks = tasksFor(column.id);
        return <div key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={async (event) => {
          event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain") || draggingId; const task = board.tasks.find((item) => item.id === taskId);
          if (!task || task.columnId === column.id) return;
          try { await request(`/api/tasks/${task.id}`, "PATCH", { columnId: column.id, position: (Math.max(0, ...tasks.map((item) => item.position)) + 1000) }); await mutate(); }
          catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível mover a tarefa."); }
          finally { setDraggingId(null); }
        }} style={{ minWidth: 280, width: 280, padding: 12, background: "var(--color-sidebar)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {renaming === column.id ? <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && renameValue.trim()) { try { await request(`/api/columns/${column.id}`, "PATCH", { name: renameValue }); setRenaming(null); await mutate(); } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível renomear a coluna."); } } }} style={fieldStyle} /> : <><strong style={{ flex: 1, font: "500 14px/20px var(--font-sans)" }}>{column.name}</strong><span style={{ color: "var(--color-muted-foreground)", font: "400 13px/18px var(--font-sans)" }}>{tasks.length}</span></>}
            <Button variant="link" icon="square-pen" title="Renomear coluna" onClick={() => { setRenaming(column.id); setRenameValue(column.name); }} />
            <Button variant="link" icon="trash-can" title="Excluir coluna" onClick={async () => { try { await request(`/api/columns/${column.id}`, "DELETE"); await mutate(); } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível excluir a coluna."); } }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 32 }}>
            {tasks.map((task) => <div key={task.id} draggable onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.setData("text/plain", task.id); }} style={{ padding: 12, background: "var(--color-background)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", cursor: "grab" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><strong style={{ flex: 1, font: "500 14px/20px var(--font-sans)" }}>{task.title}</strong><Button variant="link" icon="trash-can" title="Excluir tarefa" onClick={async () => { try { await request(`/api/tasks/${task.id}`, "DELETE"); await mutate(); } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível excluir a tarefa."); } }} /></div>
              {task.kind.startsWith("ai:") ? <span style={{ display: "inline-block", marginTop: 8, padding: "2px 6px", borderRadius: 5, background: "var(--type-informal-bg)", color: "var(--color-primary)", font: "500 11px/16px var(--font-sans)" }}>{task.kind.slice(3)}</span> : null}
              {task.detail ? <Markdown style={{ maxHeight: 70, overflow: "hidden", marginTop: 8 }}>{task.detail.slice(0, 240) + (task.detail.length > 240 ? "..." : "")}</Markdown> : null}
            </div>)}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}><input aria-label={`Nova tarefa em ${column.name}`} value={taskNames[column.id] || ""} onChange={(e) => setTaskNames((current) => ({ ...current, [column.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addTask(column.id); }} placeholder="Nova tarefa" style={fieldStyle} /><Button variant="outline" icon="add-more" onClick={() => addTask(column.id)}>Adicionar</Button></div>
        </div>;
      })}
      <div style={{ minWidth: 280, padding: 12, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-lg)" }}><div style={{ display: "flex", gap: 6 }}><input aria-label="Nome da nova coluna" value={columnName} onChange={(e) => setColumnName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addColumn(); }} placeholder="Nome da coluna" style={fieldStyle} /><Button variant="outline" icon="add-more" onClick={addColumn}>Coluna</Button></div></div>
    </div>
  </div>;
}
