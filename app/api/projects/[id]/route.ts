import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
}

interface ColumnRow { id: string; projectId: string; name: string; position: number; createdAt: string; }
interface TaskRow { id: string; projectId: string; columnId: string; title: string; detail: string | null; kind: string; position: number; createdAt: string; }

const PROJECT_FIELDS = `id, title, description, status,
  source_type AS "sourceType", source_id AS "sourceId", created_at AS "createdAt"`;
const ALLOWED_STATUS = new Set(['ativo', 'pausado', 'arquivado']);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await pool.query<ProjectRow>(`SELECT ${PROJECT_FIELDS} FROM app_projects WHERE id = $1`, [id]);
    if (!project.rowCount) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const [columns, tasks] = await Promise.all([
      pool.query<ColumnRow>('SELECT id, project_id AS "projectId", name, position, created_at AS "createdAt" FROM app_project_columns WHERE project_id = $1 ORDER BY position ASC', [id]),
      pool.query<TaskRow>('SELECT id, project_id AS "projectId", column_id AS "columnId", title, detail, kind, position, created_at AS "createdAt" FROM app_project_tasks WHERE project_id = $1 ORDER BY position ASC', [id]),
    ]);
    return NextResponse.json({ data: { project: project.rows[0], columns: columns.rows, tasks: tasks.rows } });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    if ('status' in body && (typeof body.status !== 'string' || !ALLOWED_STATUS.has(body.status))) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const fields = ['title', 'description', 'status'].filter((field) => field in body);
    if (!fields.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    const values = fields.map((field) => body[field]);
    const project = await pool.query<ProjectRow>(
      `UPDATE app_projects SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')} WHERE id = $${values.length + 1} RETURNING ${PROJECT_FIELDS}`,
      [...values, id]
    );
    if (!project.rowCount) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ data: project.rows[0] });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const project = await client.query('SELECT id FROM app_projects WHERE id = $1 FOR UPDATE', [id]);
      if (!project.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      await client.query('DELETE FROM app_project_tasks WHERE project_id = $1', [id]);
      await client.query('DELETE FROM app_project_columns WHERE project_id = $1', [id]);
      await client.query('DELETE FROM app_projects WHERE id = $1', [id]);
      await client.query('COMMIT');
      return NextResponse.json({ data: { id } });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
