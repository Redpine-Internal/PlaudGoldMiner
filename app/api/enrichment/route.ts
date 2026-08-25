import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const SOURCE_TYPES = ['opportunity', 'insight', 'content'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function isSourceType(v: unknown): v is SourceType {
  return typeof v === 'string' && (SOURCE_TYPES as readonly string[]).includes(v);
}

const FIELDS = `id, source_type AS "sourceType", source_id AS "sourceId",
  interesting, notes, text_override AS "textOverride",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

interface EnrichmentRow {
  id: string;
  sourceType: string;
  sourceId: string;
  interesting: boolean;
  notes: string | null;
  textOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReferenceRow {
  id: string;
  kind: string;
  title: string | null;
  url: string;
  storagePath: string | null;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const sourceType = sp.get('sourceType');
    const sourceId = sp.get('sourceId');
    if (!isSourceType(sourceType) || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    const enrich = await pool.query<EnrichmentRow>(
      `SELECT ${FIELDS} FROM app_idea_enrichment WHERE source_type = $1 AND source_id = $2`,
      [sourceType, sourceId]
    );
    if (!enrich.rows.length) {
      return NextResponse.json({ data: null });
    }
    const row = enrich.rows[0];
    const refs = await pool.query<ReferenceRow>(
      `SELECT id, kind, title, url, storage_path AS "storagePath", created_at AS "createdAt"
       FROM app_idea_enrichment_reference WHERE enrichment_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );
    return NextResponse.json({ data: { ...row, references: refs.rows } });
  } catch (error) {
    console.error('Error reading enrichment:', error);
    return NextResponse.json({ error: 'Failed to read enrichment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { sourceType, sourceId, interesting, notes, textOverride } = body ?? {};
    if (!isSourceType(sourceType) || typeof sourceId !== 'string' || !sourceId) {
      return NextResponse.json({ error: 'sourceType e sourceId são obrigatórios' }, { status: 400 });
    }
    const result = await pool.query<EnrichmentRow>(
      `INSERT INTO app_idea_enrichment (id, source_type, source_id, interesting, notes, text_override)
       VALUES ($1, $2, $3, COALESCE($4, false), $5, $6)
       ON CONFLICT (source_type, source_id) DO UPDATE SET
         interesting = COALESCE($4, app_idea_enrichment.interesting),
         notes = COALESCE($5, app_idea_enrichment.notes),
         text_override = COALESCE($6, app_idea_enrichment.text_override),
         updated_at = now()
       RETURNING ${FIELDS}`,
      [
        crypto.randomUUID(),
        sourceType,
        sourceId,
        typeof interesting === 'boolean' ? interesting : null,
        typeof notes === 'string' ? notes : null,
        typeof textOverride === 'string' ? textOverride : null,
      ]
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error upserting enrichment:', error);
    return NextResponse.json({ error: 'Failed to save enrichment' }, { status: 500 });
  }
}
