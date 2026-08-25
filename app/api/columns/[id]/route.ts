import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface ColumnRow {
  id: string;
  project_id: string;
  name: string;
  position: number;
  created_at: string;
}

function toColumn(row: ColumnRow) {
  return { id: row.id, projectId: row.project_id, name: row.name, position: row.position, createdAt: row.created_at };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const values: (string | number)[] = [id];
    const updates: string[] = [];
    if (typeof body?.name === 'string') {
      values.push(body.name);
      updates.push(`name = $${values.length}`);
    }
    if (typeof body?.position === 'number' && Number.isFinite(body.position)) {
      values.push(body.position);
      updates.push(`position = $${values.length}`);
    }
    if (!updates.length) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

    const result = await pool.query<ColumnRow>(
      `UPDATE app_project_columns SET ${updates.join(', ')} WHERE id = $1
       RETURNING id, project_id, name, position, created_at`,
      values
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Column not found' }, { status: 404 });
    return NextResponse.json({ data: toColumn(result.rows[0]) });
  } catch (error) {
    console.error('Error updating project column:', error);
    return NextResponse.json({ error: 'Failed to update project column' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const count = await pool.query<{ count: string }>('SELECT COUNT(*) FROM app_project_tasks WHERE column_id = $1', [id]);
    if (Number(count.rows[0].count) > 0) {
      return NextResponse.json({ error: 'Coluna possui tarefas; mova ou exclua as tarefas antes de remover a coluna.' }, { status: 409 });
    }
    const result = await pool.query('DELETE FROM app_project_columns WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return NextResponse.json({ error: 'Column not found' }, { status: 404 });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('Error deleting project column:', error);
    return NextResponse.json({ error: 'Failed to delete project column' }, { status: 500 });
  }
}
