import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_FILE_SIZE } from '@/lib/validators/upload';

const { db, values } = vi.hoisted(() => {
  const values = vi.fn(async () => undefined);
  const db = {
    insert: vi.fn(() => ({ values })),
    select: vi.fn(() => ({ from: () => ({ where: () => ({
      limit: async () => [{ id: '00000000-0000-4000-8000-000000000001', title: 'registro' }],
    }) }) })),
  };
  return { db, values };
});
vi.mock('@/lib/db', () => ({ db }));

import { POST } from '@/app/api/conversations/upload/route';

beforeEach(() => { vi.clearAllMocks(); });

async function upload(file: File | string | null, metadata: Record<string, string> = {}) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  for (const [key, value] of Object.entries(metadata)) form.set(key, value);
  return POST(new NextRequest('http://localhost/api/conversations/upload', { method: 'POST', body: form }));
}

function noDatabaseCalls() {
  expect(db.insert).not.toHaveBeenCalled();
  expect(db.select).not.toHaveBeenCalled();
}

const invalidMetadata: Record<string, string>[] = [
  { type: 'inexistente' }, { date: 'não-é-data' }, { title: 'a'.repeat(201) },
];

describe('validação do upload antes da persistência', () => {
  it.each(['json', 'JSON', 'JsOn'])('recusa JSON malformado em .%s', async (extension) => {
    const response = await upload(new File(['{ inválido'], `registro.${extension}`));
    expect(response.status).toBe(400);
    noDatabaseCalls();
  });

  it.each(['json', 'JSON', 'JsOn'])('aceita JSON válido em .%s e preserva sua transcrição', async (extension) => {
    const content = JSON.stringify({ text: 'Transcrição sintética.' });
    const response = await upload(new File([content], `registro.${extension}`));
    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ title: 'registro', transcription: content, source: 'upload' }));
  });

  it.each([['txt', ''], ['txt', ' \n\t'], ['json', ''], ['JSON', '   ']])('recusa conteúdo vazio .%s (%j)', async (extension, content) => {
    const response = await upload(new File([content], `registro.${extension}`));
    expect(response.status).toBe(400);
    noDatabaseCalls();
  });

  it.each([null, 'não sou um arquivo'])('recusa ausência de File ou campo textual (%j)', async (file) => {
    expect((await upload(file)).status).toBe(400);
    noDatabaseCalls();
  });

  it.each(invalidMetadata)('recusa metadados inválidos com 400 e detalhes de validação', async (metadata) => {
    const response = await upload(new File(['Texto sintético.'], 'registro.txt'), metadata);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details.length).toBeGreaterThan(0);
    noDatabaseCalls();
  });

  it('recusa extensão incompatível', async () => {
    expect((await upload(new File(['Texto'], 'registro.mp3'))).status).toBe(400);
    noDatabaseCalls();
  });

  it('recusa um byte acima de 10 MB antes de gravar', async () => {
    expect((await upload(new File(['x'.repeat(MAX_FILE_SIZE + 1)], 'registro.txt'))).status).toBe(413);
    noDatabaseCalls();
  });
});
