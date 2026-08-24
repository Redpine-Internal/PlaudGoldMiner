// Setup + seed for local SQLite (file:local.db).
// Applies all migration SQL files, then seeds example data adapted from lib/mock-data.ts.
// Usage: node scripts/setup-db.mjs
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'lib', 'db', 'migrations');

const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const sec = (d) => Math.floor(new Date(d).getTime() / 1000);

async function applyMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(migrationsDir, file), 'utf8');
    const stmts = raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) {
      try {
        await db.execute(stmt);
      } catch (e) {
        // Idempotent: ignore "already exists" so re-running is safe.
        if (!/already exists/i.test(String(e.message))) throw e;
      }
    }
    console.log(`  applied ${file} (${stmts.length} stmts)`);
  }
}

// Conversations — carry transcription/summary so the cross-insight AI path has real material.
const conversations = [
  {
    id: 'conv-1', title: 'Alinhamento estratégico Q3', date: '2025-07-15T10:00:00Z',
    duration: '01:30:00', type: 'reuniao', status: 'processado', source: 'upload',
    summary: 'Definição de metas e KPIs para o terceiro trimestre. Equipe apontou dificuldade em acompanhar progresso de projetos em planilhas.',
    transcription: 'Discutimos as metas do Q3. Ficou claro que as equipes estão perdidas usando planilhas para acompanhar projetos. Precisamos de um sistema interno de gestão. A métrica de sucesso será engajamento de usuários ativos diários.',
    topics: JSON.stringify(['metas', 'KPIs', 'gestão de projetos', 'planilhas']),
    participants: JSON.stringify(['Andreza', 'Equipe de produto']),
  },
  {
    id: 'conv-2', title: 'Treinamento nova plataforma de CRM', date: '2025-07-14T14:00:00Z',
    duration: '02:15:00', type: 'treinamento', status: 'processado', source: 'upload',
    summary: 'Apresentação das funcionalidades do novo CRM para a equipe de vendas. Ciclo de vendas apontado como muito longo.',
    transcription: 'Treinamento do novo CRM. A equipe de vendas comentou repetidamente que o ciclo de vendas está muito longo e que o funil precisa de otimização. Sugerido incluir etapa de demonstração técnica obrigatória.',
    topics: JSON.stringify(['CRM', 'vendas', 'funil', 'ciclo de vendas']),
    participants: JSON.stringify(['Andreza', 'Equipe de vendas']),
  },
  {
    id: 'conv-3', title: 'Café com startup de IA', date: '2025-07-14T09:00:00Z',
    duration: '00:45:00', type: 'informal', status: 'processado', source: 'upload',
    summary: 'Discussão sobre possíveis parcerias e sinergias com startup de IA.',
    transcription: 'Conversa informal com a startup. Exploramos parcerias estratégicas. A empresa é uma potencial parceira em soluções de IA aplicada a produtividade.',
    topics: JSON.stringify(['parceria', 'IA', 'produtividade']),
    participants: JSON.stringify(['Andreza', 'Fundador da startup']),
  },
  {
    id: 'conv-4', title: 'Processo de Onboarding', date: '2025-07-12T11:00:00Z',
    duration: '01:00:00', type: 'outro', status: 'pendente', source: 'drive',
    summary: 'Aguardando processamento do áudio.',
    transcription: null, topics: null, participants: null,
  },
  {
    id: 'conv-5', title: 'Revisão de performance H1', date: '2025-07-11T16:00:00Z',
    duration: '01:20:00', type: 'reuniao', status: 'erro', source: 'upload',
    summary: 'Falha na transcrição do áudio.',
    transcription: null, topics: null, participants: null,
  },
];

// Opportunities — mock references conversation by title (`source`); resolve to conversationId.
const titleToId = Object.fromEntries(conversations.map((c) => [c.title, c.id]));
const opportunities = [
  { id: 'opp-1', title: 'Criar sistema de gestão de projetos interno', pain: 'Equipes usando planilhas e tendo dificuldade em acompanhar o progresso.', srcTitle: 'Alinhamento estratégico Q3', score: 95, type: 'sistema', status: 'nova', createdAt: '2025-07-15T12:00:00Z' },
  { id: 'opp-2', title: 'Produto digital sobre gestão de tempo', pain: 'Múltiplas menções sobre sobrecarga de trabalho e falta de foco.', srcTitle: 'Revisão de performance H1', score: 80, type: 'produto', status: 'analise', createdAt: '2025-07-11T18:00:00Z' },
  { id: 'opp-3', title: 'Consultoria de otimização de funil de vendas', pain: 'Equipe de vendas mencionou que o ciclo de vendas está muito longo.', srcTitle: 'Treinamento nova plataforma de CRM', score: 88, type: 'consultoria', status: 'qualificada', createdAt: '2025-07-14T17:00:00Z' },
];

const contents = [
  { id: 'cont-1', title: '5 Dicas para um Planejamento Trimestral Eficaz', platform: 'blog', theme: 'Produtividade', mentionCount: 8, relevanceScore: 90, status: 'sugerido' },
  { id: 'cont-2', title: 'Como escolher o CRM certo para sua empresa', platform: 'youtube', theme: 'Vendas', mentionCount: 5, relevanceScore: 85, status: 'producao' },
  { id: 'cont-3', title: 'O Futuro da Inteligência Artificial nos Negócios', platform: 'linkedin', theme: 'Tecnologia', mentionCount: 12, relevanceScore: 98, status: 'publicado' },
];

async function seed() {
  // Clean (idempotent re-seed). Order respects FKs.
  for (const t of ['content_sources', 'cross_insight_conversations', 'cross_insights', 'opportunities', 'contents', 'conversations']) {
    await db.execute(`DELETE FROM ${t}`);
  }

  for (const c of conversations) {
    await db.execute({
      sql: `INSERT INTO conversations (id,title,date,duration,type,status,transcription,summary,topics,participants,tags,source,source_file_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [c.id, c.title, sec(c.date), c.duration, c.type, c.status, c.transcription, c.summary, c.topics, c.participants, null, c.source, null, sec(c.date), sec(c.date)],
    });
  }

  for (const o of opportunities) {
    await db.execute({
      sql: `INSERT INTO opportunities (id,conversation_id,title,pain,context,score,type,status,notes,tags,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [o.id, titleToId[o.srcTitle] ?? null, o.title, o.pain, null, o.score, o.type, o.status, null, null, sec(o.createdAt)],
    });
  }

  for (const ct of contents) {
    await db.execute({
      sql: `INSERT INTO contents (id,title,platform,theme,outline,mention_count,relevance_score,status,notes,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [ct.id, ct.title, ct.platform, ct.theme, null, ct.mentionCount, ct.relevanceScore, ct.status, null, sec('2025-07-15T00:00:00Z')],
    });
  }

  // Single-row user profile for Perfil persistence.
  await db.execute({
    sql: `INSERT INTO user_profile (id,name,email,bio,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO NOTHING`,
    args: ['default', 'Andreza', 'andreza@example.com',
      'Consultora de produtividade e gestão. O Clone aprende com minhas conversas para gerar oportunidades e conteúdos.',
      sec('2025-07-15T00:00:00Z')],
  });
}

async function main() {
  console.log(`DB: ${url}`);
  console.log('Applying migrations...');
  await applyMigrations();
  console.log('Seeding...');
  await seed();

  const counts = {};
  for (const t of ['conversations', 'opportunities', 'contents', 'user_profile']) {
    const r = await db.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    counts[t] = r.rows[0].n;
  }
  const proc = await db.execute(`SELECT COUNT(*) AS n FROM conversations WHERE status='processado'`);
  console.log('Counts:', counts, '| processadas:', proc.rows[0].n);
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
