import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
const KINDS = ['link', 'image'] as const;

function inList<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

interface RefRow {
  id: string;
  kind: string;
  title: string | null;
  url: string;
  storagePath: string | null;
  createdAt: string;
}

/** Garante um enrichment para (sourceType, sourceId) e devolve seu id. */
async function ensureEnrichmentId(sourceType: string, sourceId: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO app_idea_enrichment (id, source_type, source_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [crypto.randomUUID(), sourceType, sourceId]
  );
  return res.rows[0].id;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, kind, title, url, storagePath } = body ?? {};
    if (!inList(SOURCE_TYPES, sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    if (!inList(KINDS, kind)) {
      return NextResponse.json({ error: "O tipo deve ser 'link' ou 'image'" }, { status: 400 });
    }
    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'url é obrigatória' }, { status: 400 });
    }
    const enrichmentId = await ensureEnrichmentId(sourceType, sourceId);
    const result = await pool.query<RefRow>(
      `INSERT INTO app_idea_enrichment_reference (id, enrichment_id, kind, title, url, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, title, url, storage_path AS "storagePath", created_at AS "createdAt"`,
      [
        crypto.randomUUID(),
        enrichmentId,
        kind,
        typeof title === 'string' ? title : null,
        url.trim(),
        typeof storagePath === 'string' ? storagePath : null,
      ]
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('Error adding reference:', error);
    return NextResponse.json({ error: 'Failed to add reference' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    }
    const found = await pool.query<{ kind: string; storagePath: string | null }>(
      `DELETE FROM app_idea_enrichment_reference WHERE id = $1
       RETURNING kind, storage_path AS "storagePath"`,
      [id]
    );
    if (!found.rows.length) {
      return NextResponse.json({ error: 'referência não encontrada' }, { status: 404 });
    }
    const ref = found.rows[0];
    // Best-effort: remover o objeto do Storage se for imagem.
    if (ref.kind === 'image' && ref.storagePath) {
      try {
        const { removeObject } = await import('@/lib/supabaseStorage');
        await removeObject(ref.storagePath);
      } catch (e) {
        console.error('Falha ao remover objeto do storage (ignorado):', e);
      }
    }
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('Error deleting reference:', error);
    return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 });
  }
}
