import { NextRequest } from 'next/server';
import { db, pool } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { collectionPagination, collectionSearch, collectionValues, foldedSearchSql } from '@/lib/collection-query';
import { conversationDuration } from '@/lib/presentation/conversation-duration';
import { z } from 'zod';
import {
  conversationCreateSchema,
  conversationListSchema,
  formatZodError,
} from '@/lib/validators/conversation';

const listFilters = conversationListSchema.omit({ type: true, limit: true }).extend({
  types: z.array(z.enum(['reuniao', 'treinamento', 'informal', 'outro'])),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  content: z.array(z.enum(['hasSummary', 'hasTranscription', 'hasInsights'])),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'A data inicial deve ser anterior ou igual à data final.', path: ['from'],
});

const contentFlags = {
  hasSummary: "NULLIF(btrim(c.summary), '') IS NOT NULL",
  hasTranscription: "NULLIF(btrim(c.transcription), '') IS NOT NULL",
  // The live view and legacy app tables mix uuid and text identifiers.
  hasInsights: `EXISTS (SELECT 1 FROM app_opportunities o WHERE o.conversation_id::text = c.id::text
    OR EXISTS (SELECT 1 FROM app_opportunity_sources s
      WHERE s.opportunity_id::text = o.id::text AND s.conversation_id::text = c.id::text))`,
};

// GET /api/conversations - List conversations with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = listFilters.parse({
      status: searchParams.get('status') || undefined,
      types: collectionValues(searchParams, 'type'),
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      content: collectionValues(searchParams, 'content'),
    });
    const { limit, offset } = collectionPagination(searchParams);
    const filters: string[] = [];
    const values: unknown[] = [];
    if (params.status) {
      values.push(params.status);
      filters.push(`c.status = $${values.length}`);
    }
    if (params.types.length) {
      values.push(params.types);
      filters.push(`c.type = ANY($${values.length}::text[])`);
    }
    const search = searchParams.get('search')?.trim();
    if (search) {
      values.push(collectionSearch(search));
      filters.push(`(${foldedSearchSql('c.title')} LIKE $${values.length} OR ${foldedSearchSql('c.summary')} LIKE $${values.length})`);
    }
    if (params.from) {
      values.push(params.from);
      filters.push(`c.date >= $${values.length}::date`);
    }
    if (params.to) {
      values.push(params.to);
      filters.push(`c.date < $${values.length}::date + INTERVAL '1 day'`);
    }
    params.content.forEach((flag) => filters.push(`(${contentFlags[flag]})`));
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [result, countResult] = await Promise.all([
      pool.query(`SELECT c.id, c.title, c.date, c.duration, c.type, c.status,
        c.summary, c.topics, c.participants, c.source, c.source_file_id AS "sourceFileId",
        (${contentFlags.hasSummary}) AS "hasSummary",
        (${contentFlags.hasTranscription}) AS "hasTranscription",
        (${contentFlags.hasInsights}) AS "hasInsights"
        FROM conversations c ${where}
        ORDER BY c.date DESC, c.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]),
      pool.query<{ total: string }>(`SELECT count(*) AS total FROM conversations c ${where}`, values),
    ]);

    return Response.json({
      data: result.rows.map((row) => ({ ...row, duration: conversationDuration(row.duration, row.source) })),
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] GET /api/conversations error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = conversationCreateSchema.parse(body);

    // Prepare data for insertion
    const newConversation = {
      id: crypto.randomUUID(),
      title: validated.title,
      date: validated.date,
      duration: validated.duration,
      type: validated.type,
      status: 'pendente' as const,
      transcription: validated.transcription,
      summary: validated.summary,
      topics: validated.topics ? JSON.stringify(validated.topics) : null,
      participants: validated.participants ? JSON.stringify(validated.participants) : null,
      tags: validated.tags ? JSON.stringify(validated.tags) : null,
      source: validated.source,
      sourceFileId: validated.sourceFileId,
    };

    // NB: RETURNING não é suportado em views com INSTEAD OF; fetch-after-write
    // pelo id que geramos acima.
    await db.insert(conversations).values(newConversation);

    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, newConversation.id))
      .limit(1);

    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(formatZodError(error), { status: 400 });
    }
    console.error('[API] POST /api/conversations error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
