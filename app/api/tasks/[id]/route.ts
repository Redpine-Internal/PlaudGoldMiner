import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface TaskRow {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  detail: string | null;
  kind: string;
  position: number;
  created_at: string;
}

function toTask(row: TaskRow) {
  return { id: row.id, projectId: row.project_id, columnId: row.column_id, title: row.title, detail: row.detail, kind: row.kind, position: row.position, createdAt: row.created_at };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const values: (string | number | null)[] = [id];
    const updates: string[] = [];
    const add = (column: string, value: string | number | null) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    if (typeof body?.title === 'string') add('title', body.title);
    if (body && Object.hasOwn(body, 'detail') && (typeof body.detail === 'string' || body.detail === null)) add('detail', body.detail);
    if (typeof body?.columnId === 'string') add('column_id', body.columnId);
    if (typeof body?.position === 'number' && Number.isFinite(body.position)) add('position', body.position);
    if (!updates.length) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

    const result = await pool.query<TaskRow>(
      `UPDATE app_project_tasks SET ${updates.join(', ')} WHERE id = $1
       RETURNING id, project_id, column_id, title, detail, kind, position, created_at`,
      values
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ data: toTask(result.rows[0]) });
  } catch (error) {
    console.error('Error updating project task:', error);
    return NextResponse.json({ error: 'Failed to update project task' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await pool.query('DELETE FROM app_project_tasks WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('Error deleting project task:', error);
    return NextResponse.json({ error: 'Failed to delete project task' }, { status: 500 });
  }
}
