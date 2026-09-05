"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState, Markdown } from "@/components/ds";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatEnrichmentSourceType, formatProjectStatus, formatProjectTaskKind } from "@/lib/presentation/labels";
import { ApiError, fetchJson } from "@/lib/http";

const fetcher = fetchJson;

type Task = { id: string; projectId: string; columnId: string; title: string; detail: string | null; kind: string; position: number; createdAt: string };
type Column = { id: string; projectId: string; name: string; position: number; createdAt: string };
type Board = { project: { id: string; title: string; description: string | null; status: string; sourceType: string; sourceId: string; createdAt: string }; columns: Column[]; tasks: Task[] };
type ApiResponse = { data: Board };

const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-background)", color: "var(--color-foreground)", font: "400 14px/20px var(--font-sans)" };

export default function ProjetoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isMobile = useIsMobile();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiResponse>(projectId ? `/api/projects/${projectId}` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: (error) => !(error instanceof ApiError && error.status === 404) });
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
  const [mobileColumnId, setMobileColumnId] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [pendingMutation, setPendingMutation] = useState(false);
  const mutationInFlight = useRef(false);

  const request = async (url: string, method: string, body?: unknown) => {
    if (mutationInFlight.current) throw new Error("Aguarde a operação em andamento.");
    mutationInFlight.current = true;
    setPendingMutation(true);
    setMessage(null);
    try {
      return await fetchJson(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    } finally {
      mutationInFlight.current = false;
      setPendingMutation(false);
    }
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

  const renameColumn = async () => {
    if (!renaming || !renameValue.trim()) return;
    try { await request(`/api/columns/${renaming}`, "PATCH", { name: renameValue.trim() }); setRenaming(null); await mutate(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível renomear a coluna."); }
  };

  if (!board && (error || !isLoading)) {
    const notFound = !error || (error instanceof ApiError && error.status === 404);
    return <div className="pgm-project-board-page">
      <div role="alert">
        <EmptyState icon={notFound ? "folder" : "alert-circle"} title={notFound ? "Projeto não encontrado" : "Não foi possível carregar o projeto"} message={notFound ? "Este projeto não está disponível. Volte à lista ou tente carregar novamente." : "Verifique sua conexão e tente novamente."} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button variant="outline" icon="arrow-left" onClick={() => router.push("/projetos")}>Voltar aos projetos</Button>
        <Button icon="refresh-cw" iconSpin={isValidating} disabled={isValidating} onClick={() => void mutate()}>{isValidating ? "Carregando..." : "Tentar novamente"}</Button>
      </div>
    </div>;
  }

  if (isLoading || !board) return <div aria-busy="true" aria-label="Carregando projeto" style={{ display: "flex", gap: 16, overflow: "hidden" }}>{[1, 2, 3].map((n) => <div key={n} style={{ minWidth: 280, height: 260, borderRadius: "var(--radius-lg)", background: "var(--color-sidebar)", border: "1px solid var(--color-border)" }} />)}</div>;

  const tasksFor = (columnId: string) => board.tasks.filter((task) => task.columnId === columnId);
  const activeColumnId = board.columns.some((column) => column.id === mobileColumnId) ? mobileColumnId : board.columns[0]?.id;
  const visibleColumns = isMobile ? board.columns.filter((column) => column.id === activeColumnId) : board.columns;
  const actions: Array<["aprofundar" | "plano" | "riscos" | "conteudo", string]> = [["aprofundar", "Aprofundar"], ["plano", "Virar plano"], ["riscos", "Riscos e perguntas"], ["conteudo", "Gerar conteúdo"]];

  return <div className="pgm-project-board-page">
    <div className="pgm-project-header">
      <div className="pgm-project-header__main">
        <Button variant="link" icon="arrow-left" onClick={() => router.push("/projetos")}>Projetos</Button>
        {editing ? <input className="pgm-project-header__title-input" aria-label="Título do projeto" disabled={pendingMutation} value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, marginTop: 8 }} /> : <h1 className="pgm-project-header__title">{board.project.title}</h1>}
        {editing ? <textarea aria-label="Descrição do projeto" disabled={pendingMutation} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...fieldStyle, marginTop: 4, resize: "vertical" }} /> : board.project.description ? <p className="pgm-project-header__description">{board.project.description}</p> : null}
        <div className="pgm-project-header__metadata">
          <span>Origem: <strong>{formatEnrichmentSourceType(board.project.sourceType)}</strong></span>
          <span>Criado em: <strong>{new Date(board.project.createdAt).toLocaleDateString("pt-BR")}</strong></span>
        </div>
      </div>
      <div className="pgm-project-header__actions">
        <span className="pgm-project-status">{formatProjectStatus(board.project.status)}</span>
        {editing ? <><Button variant="outline" disabled={pendingMutation} onClick={() => { setEditing(false); setMessage(null); }}>Cancelar</Button><Button variant="primary" disabled={pendingMutation || !title.trim()} onClick={saveProject}>{pendingMutation ? "Salvando..." : "Salvar"}</Button></> : <Button variant="outline" icon="square-pen" disabled={pendingMutation} onClick={() => { setTitle(board.project.title); setDescription(board.project.description || ""); setEditing(true); }}>Editar</Button>}
      </div>
    </div>

    {message ? <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)", font: "400 13px/18px var(--font-sans)" }}>{message}</div> : null}
    {error ? <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", background: "var(--alert-error-bg)", color: "var(--alert-error-fg)", border: "1px solid var(--alert-error-border)", borderRadius: "var(--radius-lg)" }}>Erro ao carregar o projeto. Tente novamente.</div> : null}
    {pendingMutation ? <p role="status">{generating ? "Gerando tarefas..." : "Salvando alterações..."}</p> : null}

    <div className="pgm-project-command-bar" aria-label="Ações de inteligência do projeto">
      {actions.map(([action, label], index) => <Button key={action} className={index === 0 ? "pgm-project-command--primary" : ""} variant={index === 0 ? "primary" : "outline"} icon="sparkles" iconSpin={generating === action} disabled={!!generating || pendingMutation} onClick={() => generate(action)}>{generating === action ? "Gerando..." : label}</Button>)}
      <Button className="pgm-project-command--refresh" variant="outline" icon="refresh-cw" iconSpin={isValidating} disabled={pendingMutation || isValidating} onClick={() => mutate()} aria-label="Atualizar projeto" title="Atualizar projeto" />
    </div>

    {!board.columns.length ? <EmptyState icon="add-more" title="Nenhuma coluna" message="Adicione uma coluna para começar a organizar o projeto." /> : null}
    {isMobile && board.columns.length ? (
      <label className="pgm-kanban-stage-picker">
        <span>Etapa visível</span>
        <select value={activeColumnId} onChange={(event) => setMobileColumnId(event.target.value)}>
          {board.columns.map((column) => <option key={column.id} value={column.id}>{column.name} · {tasksFor(column.id).length}</option>)}
        </select>
      </label>
    ) : null}
    <div className="pgm-kanban-viewport" role="region" aria-label="Quadro do projeto" tabIndex={0}>
    <div className="pgm-kanban-board">
      {visibleColumns.map((column) => {
        const tasks = tasksFor(column.id);
        return <section key={column.id} aria-label={`Etapa ${column.name}`} onDragOver={(event) => event.preventDefault()} onDrop={async (event) => {
          event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain") || draggingId; const task = board.tasks.find((item) => item.id === taskId);
          if (!task || task.columnId === column.id || pendingMutation) return;
          try { await request(`/api/tasks/${task.id}`, "PATCH", { columnId: column.id, position: (Math.max(0, ...tasks.map((item) => item.position)) + 1000) }); await mutate(); }
          catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível mover a tarefa."); }
          finally { setDraggingId(null); }
        }} className="pgm-kanban-column">
          <div className="pgm-kanban-column__header">
            {renaming === column.id ? <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <input aria-label={`Novo nome da coluna ${column.name}`} autoFocus disabled={pendingMutation} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); if (e.key === "Enter") void renameColumn(); }} style={{ ...fieldStyle, minWidth: 0 }} />
              <Button variant="link" icon="check" aria-label="Salvar nome da coluna" disabled={pendingMutation || !renameValue.trim()} onClick={() => void renameColumn()} />
              <Button variant="link" icon="x" aria-label="Cancelar renomeação" disabled={pendingMutation} onClick={() => setRenaming(null)} />
            </div> : <><strong id={`pgm-kanban-column-${column.id}`}>{column.name}</strong><span aria-label={`${tasks.length} tarefas`}>{tasks.length}</span>
              <Button variant="link" icon="square-pen" aria-label={`Renomear coluna ${column.name}`} title="Renomear coluna" disabled={pendingMutation} onClick={() => { setRenaming(column.id); setRenameValue(column.name); }} />
              <Button variant="link" icon="trash-can" aria-label={`Excluir coluna ${column.name}`} title="Excluir coluna" disabled={pendingMutation} onClick={async () => { if (!window.confirm(`Excluir a coluna "${column.name}"? Esta ação não pode ser desfeita.`)) return; try { await request(`/api/columns/${column.id}`, "DELETE"); await mutate(); } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível excluir a coluna."); } }} />
            </>}
          </div>
          <div className="pgm-kanban-column__tasks" role="list">
            {tasks.map((task) => <div key={task.id} role="listitem" draggable={!isMobile && !pendingMutation} onDragStart={(event) => { setDraggingId(task.id); event.dataTransfer.setData("text/plain", task.id); }} className="pgm-kanban-task">
              <div className="pgm-kanban-task__header"><strong>{task.title}</strong><Button variant="link" icon="trash-can" aria-label={`Excluir tarefa ${task.title}`} title="Excluir tarefa" disabled={pendingMutation} onClick={async () => { if (!window.confirm(`Excluir a tarefa "${task.title}"? Esta ação não pode ser desfeita.`)) return; try { await request(`/api/tasks/${task.id}`, "DELETE"); await mutate(); } catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível excluir a tarefa."); } }} /></div>
              {task.kind.startsWith("ai:") ? <span style={{ display: "inline-block", marginTop: 8, padding: "2px 6px", borderRadius: 5, background: "var(--type-informal-bg)", color: "var(--color-primary)", font: "500 11px/16px var(--font-sans)" }}>{formatProjectTaskKind(task.kind)}</span> : null}
              {task.detail ? <div className={`pgm-kanban-task__detail${expandedTasks[task.id] ? " is-expanded" : ""}`}><Markdown>{task.detail}</Markdown></div> : null}
              {task.detail ? <Button className="pgm-kanban-task__toggle" variant="link" size="sm" onClick={() => setExpandedTasks((current) => ({ ...current, [task.id]: !current[task.id] }))}>{expandedTasks[task.id] ? "Ocultar detalhes" : "Ver detalhes"}</Button> : null}
              {board.columns.length > 1 ? (
                <label className="pgm-kanban-move">
                  <span>Mover para</span>
                  <select value={task.columnId} disabled={pendingMutation} onChange={async (event) => {
                    const columnId = event.target.value;
                    const destinationTasks = tasksFor(columnId);
                    try {
                      await request(`/api/tasks/${task.id}`, "PATCH", { columnId, position: Math.max(0, ...destinationTasks.map((item) => item.position)) + 1000 });
                      await mutate();
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Não foi possível mover a tarefa.");
                    }
                  }}>
                    {board.columns.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                  </select>
                </label>
              ) : null}
            </div>)}
          </div>
          <div className="pgm-kanban-add-task"><input aria-label={`Nova tarefa em ${column.name}`} disabled={pendingMutation} value={taskNames[column.id] || ""} onChange={(e) => setTaskNames((current) => ({ ...current, [column.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addTask(column.id); }} placeholder="Nova tarefa" style={fieldStyle} /><Button variant="outline" icon="add-more" disabled={pendingMutation || !taskNames[column.id]?.trim()} onClick={() => addTask(column.id)}>Adicionar tarefa</Button></div>
        </section>;
      })}
      <div className="pgm-kanban-new-column"><strong>Adicionar coluna</strong><div><input aria-label="Nome da nova coluna" disabled={pendingMutation} value={columnName} onChange={(e) => setColumnName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addColumn(); }} placeholder="Nome da coluna" style={fieldStyle} /><Button variant="outline" icon="add-more" disabled={pendingMutation || !columnName.trim()} onClick={addColumn}>Adicionar</Button></div></div>
    </div>
    </div>
  </div>;
}
