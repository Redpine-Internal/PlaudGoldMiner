import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { anthropic, DEFAULT_MODEL, isAiConfigured, checkTokenBudget } from '@/lib/ai/client';
import { db } from '@/lib/db';
import { conversations, opportunities, contents, userProfile } from '@/lib/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import {
  MINING_ELIGIBLE_CONVERSATION_TYPES,
  contentIsEligibleSql,
  opportunityHasEligibleSourceSql,
} from '@/lib/conversations/classification';
import { perConversationChars, trimToBudget } from '@/lib/clone/context-budget';

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'clone']),
        text: z.string(),
      })
    )
    .min(1),
});

// Budget for the grounded context. Azure's deployment allows 10k tokens/min;
// leave headroom for the system prompt, the chat history and the streamed
// answer, so cap the conversation block at ~6k tokens and degrade gracefully
// (full summaries first, truncating only if we'd blow the budget).
const CONTEXT_TOKEN_BUDGET = 6000;

/** Safely parse a JSON string column into a string[]. */
function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Build the Clone's knowledge context from the real DB. The Clone is grounded
 * in the user's own conversations/opportunities/contents — it must not invent
 * data, only reason over what's here.
 */
async function buildContext(): Promise<string> {
  const [convs, opps, cts, profile] = await Promise.all([
    db.select().from(conversations)
      .where(inArray(conversations.type, MINING_ELIGIBLE_CONVERSATION_TYPES))
      .orderBy(desc(conversations.date)).limit(40),
    db.select().from(opportunities)
      .where(sql.raw(opportunityHasEligibleSourceSql('app_opportunities')))
      .orderBy(desc(opportunities.score)).limit(30),
    db.select().from(contents)
      .where(sql.raw(contentIsEligibleSql('app_contents')))
      .orderBy(desc(contents.mentionCount)).limit(20),
    db.select().from(userProfile).where(eq(userProfile.id, 'default')).limit(1),
  ]);

  const parts: string[] = [];

  const bio = profile[0]?.bio?.trim();
  if (bio) parts.push(`SOBRE O USUÁRIO:\n${bio}`);

  // Conversations carry the richest signal (participants, topics, summary), so
  // give each a per-conversation summary budget that shrinks as the number of
  // conversations grows — this is what lets the Clone answer "quem é X?" and
  // "quais os temas de Y?" instead of being blind past the first 240 chars.
  //
  // The budget is a SHARE of the total, not the total — see lib/clone/context-budget.
  const perConvChars = perConversationChars(CONTEXT_TOKEN_BUDGET, convs.length);
  parts.push(
    `CONVERSAS (${convs.length}):\n` +
      convs
        .map((c) => {
          const participants = parseList(c.participants);
          const topics = parseList(c.topics);
          const lines = [`- "${c.title}" [${c.type}, ${c.status}]`];
          if (participants.length) lines.push(`  Participantes: ${participants.join(', ')}`);
          if (topics.length) lines.push(`  Tópicos: ${topics.join(', ')}`);
          if (c.summary) {
            const s = c.summary.length > perConvChars ? c.summary.slice(0, perConvChars) + '…' : c.summary;
            lines.push(`  Resumo: ${s}`);
          }
          return lines.join('\n');
        })
        .join('\n')
  );

  parts.push(
    `OPORTUNIDADES (${opps.length}):\n` +
      opps
        .map((o) => `- "${o.title}" (score ${o.score}, ${o.type}, ${o.status}): ${o.pain}`)
        .join('\n')
  );

  if (cts.length) {
    parts.push(
      `CONTEÚDOS SUGERIDOS (${cts.length}):\n` +
        cts.map((c) => `- "${c.title}" [${c.platform}] tema: ${c.theme} (${c.mentionCount} menções)`).join('\n')
    );
  }

  // Hard cap. Trims the CONVERSATION block, not the end of the text: cutting
  // from the end deleted whole sections, and conversations come first — so the
  // ones that vanished were opportunities and contents, exactly what the Clone
  // needed to answer "quais oportunidades existem?".
  return trimToBudget(parts, CONTEXT_TOKEN_BUDGET);
}

const SYSTEM_PROMPT = `Você é o "Clone" — um assistente pessoal que aprendeu com as conversas, oportunidades e conteúdos do usuário.

Regras:
- Responda SEMPRE em português do Brasil, de forma direta e útil.
- Baseie-se APENAS no CONTEXTO fornecido abaixo. Não invente conversas, oportunidades ou números que não estejam ali.
- Quando citar uma oportunidade ou conteúdo, use o título real que está no contexto.
- Ao procurar uma PESSOA, considere variações e erros de grafia do nome (ex.: "Andreza" ≈ "Andresa" ≈ "Andressa"). Se encontrar um nome parecido na lista de Participantes, trate como a mesma pessoa e diga em quais conversas ela aparece.
- Se o contexto não tiver a informação pedida, diga isso honestamente e sugira o que processar/gerar para obtê-la.
- Seja conciso: 1 a 3 parágrafos curtos. Ofereça um próximo passo quando fizer sentido.`;

export async function POST(request: NextRequest) {
  try {
    if (!isAiConfigured()) {
      return Response.json(
        { error: 'Azure OpenAI não configurado — defina AZURE_OPENAI_API_KEY e AZURE_OPENAI_RESOURCE_NAME.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { messages } = chatRequestSchema.parse(body);

    const context = await buildContext();

    // Alert #1: warn (don't block) if the grounded context is huge.
    const { warning } = checkTokenBudget(context);
    if (warning) console.warn(`[AI] Clone context ${warning}`);

    // Map the app's {user|clone} roles to the model's {user|assistant} roles.
    const modelMessages = messages.map((m) => ({
      role: (m.role === 'clone' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.text,
    }));

    const result = streamText({
      model: anthropic(DEFAULT_MODEL),
      system: `${SYSTEM_PROMPT}\n\n=== CONTEXTO ===\n${context}`,
      messages: modelMessages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues.map((e) => e.message) },
        { status: 400 }
      );
    }
    console.error('[API] POST /api/clone/chat error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
