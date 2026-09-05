import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db', () => ({ pool: { query } }));
import { PATCH } from '@/app/api/tasks/[id]/route';
import { POST } from '@/app/api/projects/[id]/tasks/route';
import { PATCH as patchColumn } from '@/app/api/columns/[id]/route';
const request = (body: unknown) => new NextRequest('http://localhost/api/tasks/task-a', { method: 'POST', body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'project-a' }) };
beforeEach(() => query.mockReset());

describe('project task boundaries', () => {
  it('rejects a destination outside the task project before updating', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect((await PATCH(request({ columnId: 'foreign-column' }), params)).status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('t.project_id = c.project_id');
  });
  it('rejects task creation in a foreign column', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect((await POST(request({ title: 'Tarefa', columnId: 'column-b' }), params)).status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['column-b', 'project-a']);
  });
  it('creates a task only after verifying project ownership', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'column-a' }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'task-a', project_id: 'project-a', column_id: 'column-a', title: 'Tarefa' }] });
    expect((await POST(request({ title: ' Tarefa ', columnId: 'column-a' }), params)).status).toBe(201);
    expect(query.mock.calls[1][1][3]).toBe('Tarefa');
  });
  it('rejects blank names before any mutation', async () => {
    expect((await PATCH(request({ title: '   ' }), params)).status).toBe(400);
    expect((await patchColumn(request({ name: '   ' }), params)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('validates optional task fields', async () => {
    expect((await POST(request({ title: 'Tarefa', columnId: 'column-a', detail: {} }), params)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
