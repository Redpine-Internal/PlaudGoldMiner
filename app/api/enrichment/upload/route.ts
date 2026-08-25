import { NextRequest, NextResponse } from 'next/server';
import { createSignedUpload } from '@/lib/supabaseStorage';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function inList<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** Remove caracteres perigosos do nome de arquivo. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, filename, contentType } = body ?? {};
    if (!inList(SOURCE_TYPES, sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    if (typeof filename !== 'string' || !filename) {
      return NextResponse.json({ error: 'filename é obrigatório' }, { status: 400 });
    }
    if (!inList(ALLOWED, contentType)) {
      return NextResponse.json({ error: 'contentType não permitido' }, { status: 400 });
    }
    const path = `enrichment/${sourceType}/${sourceId}/${crypto.randomUUID()}-${safeName(filename)}`;
    const upload = await createSignedUpload(path);
    return NextResponse.json({ data: upload });
  } catch (error) {
    console.error('Error creating upload URL:', error);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
