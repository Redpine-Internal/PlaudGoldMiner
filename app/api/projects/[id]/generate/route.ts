import * as crypto from 'crypto';
import { NextResponse } from 'next/server';
import { generateProjectTasks } from '@/lib/ai/services/project-action-generator';
import type { ProjectAction, ProjectContext } from '@/lib/ai/prompts/project-actions';
import { pool } from '@/lib/db';

const actions: ProjectAction[] = ['aprofundar', 'plano', 'riscos', 'conteudo'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { action?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  if (typeof body.action !== 'string' || !actions.includes(body.action as ProjectAction)) {
    return NextResponse.json(
      { error: 'Ação inválida. Use aprofundar, plano, riscos ou conteúdo.' },
      { status: 400 }
    );
  }

  try {
    const projectResult = await pool.query(
      'SELECT id, title, description, source_type, source_id FROM app_projects WHERE id=$1',
      [id]
    );
    const project = projectResult.rows[0] as {
      id: string;
      title: string;
      description: string | null;
      source_type: string | null;
    } | undefined;

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });
    }

    const backlogResult = await pool.query(
      'SELECT id FROM app_project_columns WHERE project_id=$1 ORDER BY position ASC LIMIT 1',
      [id]
    );
    const backlogId = backlogResult.rows[0]?.id as string | undefined;

    if (!backlogId) {
      return NextResponse.json({ error: 'Projeto sem colunas' }, { status: 400 });
    }

    const context: ProjectContext = {
      title: project.title,
      description: project.description,
      sourceType: project.source_type,
      extra: null,
    };
    const action = body.action as ProjectAction;
    const result = await generateProjectTasks(action, context);

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const positionResult = await client.query(
        'SELECT COALESCE(MAX(position), 0) AS position FROM app_project_tasks WHERE column_id=$1',
        [backlogId]
      );
      let position = Number(positionResult.rows[0].position);
      const tasks = [];

      for (const task of result.data.tasks) {
        position += 1000;
        const inserted = await client.query(
          `INSERT INTO app_project_tasks
             (id, project_id, column_id, title, detail, kind, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, project_id AS "projectId", column_id AS "columnId", title, detail,
                     kind, position, created_at AS "createdAt"`,
          [crypto.randomUUID(), id, backlogId, task.title, task.detail, `ai:${action}`, position]
        );
        tasks.push({ ...inserted.rows[0], projectId: id });
      }

      await client.query('COMMIT');
      return NextResponse.json({ data: tasks }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to generate project tasks:', error);
    return NextResponse.json({ error: 'Falha ao gerar tarefas do projeto' }, { status: 500 });
  }
}
