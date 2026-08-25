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

const PROJECT_FIELDS = `id, title, description, status,
  source_type AS "sourceType", source_id AS "sourceId", created_at AS "createdAt"`;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const filters: string[] = [];
    const values: string[] = [];
    const status = searchParams.get('status');
    const sourceType = searchParams.get('sourceType');
    const sourceId = searchParams.get('sourceId');

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    if (sourceType && sourceId) {
      values.push(sourceType, sourceId);
      filters.push(`source_type = $${values.length - 1} AND source_id = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [projects, count] = await Promise.all([
      pool.query<ProjectRow>(
        `SELECT ${PROJECT_FIELDS} FROM app_projects ${where} ORDER BY created_at DESC LIMIT $${values.length + 1}`,
        [...values, String(limit)]
      ),
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM app_projects ${where}`, values),
    ]);

    return NextResponse.json({ data: projects.rows, total: Number(count.rows[0].total) });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { title, description, sourceType, sourceId } = body ?? {};
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const project = await client.query<ProjectRow>(
        `INSERT INTO app_projects (id, title, description, status, source_type, source_id, created_at)
         VALUES ($1, $2, $3, DEFAULT, $4, $5, NOW())
         RETURNING ${PROJECT_FIELDS}`,
        [crypto.randomUUID(), title.trim(), description ?? null, sourceType ?? null, sourceId ?? null]
      );
      for (const [name, position] of [['Backlog', 1000], ['To Do', 2000], ['Doing', 3000], ['Done', 4000]] as const) {
        await client.query(
          'INSERT INTO app_project_columns (id, project_id, name, position, created_at) VALUES ($1, $2, $3, $4, NOW())',
          [crypto.randomUUID(), project.rows[0].id, name, position]
        );
      }
      await client.query('COMMIT');
      return NextResponse.json({ data: project.rows[0] }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
