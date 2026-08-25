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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.columnId !== 'string' || !body.columnId.trim() || typeof body?.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'columnId and title are required' }, { status: 400 });
    }

    const result = await pool.query<TaskRow>(
      `INSERT INTO app_project_tasks (id, project_id, column_id, title, detail, kind, position)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(position), 0) + 1000 FROM app_project_tasks WHERE column_id = $3))
       RETURNING id, project_id, column_id, title, detail, kind, position, created_at`,
      [crypto.randomUUID(), projectId, body.columnId.trim(), body.title.trim(), body.detail ?? null, body.kind ?? 'manual']
    );
    return NextResponse.json({ data: toTask(result.rows[0]) }, { status: 201 });
  } catch (error) {
    console.error('Error creating project task:', error);
    return NextResponse.json({ error: 'Failed to create project task' }, { status: 500 });
  }
}
