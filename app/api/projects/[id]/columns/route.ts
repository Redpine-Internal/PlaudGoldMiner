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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const result = await pool.query<ColumnRow>(
      `INSERT INTO app_project_columns (id, project_id, name, position)
       SELECT $1, p.id, $3, (SELECT COALESCE(MAX(position), 0) + 1000 FROM app_project_columns WHERE project_id = p.id)
       FROM app_projects p WHERE p.id = $2
       RETURNING id, project_id, name, position, created_at`,
      [crypto.randomUUID(), projectId, body.name.trim()]
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ data: toColumn(result.rows[0]) }, { status: 201 });
  } catch (error) {
    console.error('Error creating project column:', error);
    return NextResponse.json({ error: 'Failed to create project column' }, { status: 500 });
  }
}
