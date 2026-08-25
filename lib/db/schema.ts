import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// =====================================================================
// Migrado de SQLite (libSQL) para Supabase Postgres.
//
// `conversations` NÃO é uma tabela: é uma VIEW sobre `meetings` (+ summaries)
// com triggers INSTEAD OF no banco (ver /tmp/phase1_ddl.sql aplicado).
// Por isso ela é declarada com pgView aqui — o Drizzle gera SELECT/INSERT/
// UPDATE/DELETE contra a view, e o Postgres roteia para meetings/summaries.
//
// As tabelas de domínio da app foram recriadas como `app_*` (vazias, sem
// dados legados). A Fase 2 migrará a UI para as tabelas dos agentes n8n
// (business_opportunities/article_insights/social_posts); estas ficam como
// fallback local.
// =====================================================================

// ===== CONVERSATIONS =====
// No banco, `conversations` é uma VIEW sobre `meetings` (+ summaries) com
// triggers INSTEAD OF INSERT/UPDATE/DELETE (ver /tmp/phase1_ddl.sql aplicado).
// Aqui declaramos como pgTable — o Drizzle não distingue tabela de view, só
// gera `INSERT/UPDATE/DELETE INTO conversations`, que os triggers roteiam para
// meetings/summaries. Usar pgView().existing() bloquearia insert/update no
// Drizzle; pgTable mantém as 20 rotas existentes funcionando sem edição.
// OBS: não use .returning() nesta "tabela" — views com INSTEAD OF não suportam
// RETURNING no Postgres; faça fetch-after-write.
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // coluna `date` da view é Postgres date; mapeada como timestamp p/ aceitar Date.
  date: timestamp('date', { withTimezone: true }).notNull(),
  duration: text('duration'),
  type: text('type').notNull(),
  status: text('status').notNull(),
  transcription: text('transcription'),
  summary: text('summary'),
  topics: text('topics'),           // JSON string (metadata->>'topics')
  participants: text('participants'), // JSON string
  tags: text('tags'),               // JSON string
  source: text('source').notNull(),
  sourceFileId: text('source_file_id'),
  // notNull mas com defaultNow: o trigger da view preenche created_at/updated_at
  // (now()); o defaultNow aqui apenas os torna opcionais no $inferInsert.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== OPPORTUNITIES (app_opportunities) =====
export const opportunities = pgTable('app_opportunities', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),
  title: text('title').notNull(),
  pain: text('pain').notNull(),
  context: text('context'),
  score: real('score').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('nova'),
  notes: text('notes'),
  tags: text('tags'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_opportunities_conv_idx').on(table.conversationId),
  index('app_opportunities_status_idx').on(table.status),
]);

// ===== CONTENTS (app_contents) =====
export const contents = pgTable('app_contents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  platform: text('platform').notNull(),
  theme: text('theme').notNull(),
  outline: text('outline'),
  mentionCount: integer('mention_count').notNull().default(1),
  relevanceScore: real('relevance_score').notNull(),
  status: text('status').notNull().default('sugerido'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_contents_status_idx').on(table.status),
  index('app_contents_platform_idx').on(table.platform),
]);

// ===== CONTENT SOURCES (app_content_sources) =====
export const contentSources = pgTable('app_content_sources', {
  id: text('id').primaryKey(),
  contentId: text('content_id'),
  conversationId: text('conversation_id'),
  excerpt: text('excerpt'),
}, (table) => [
  index('app_content_sources_content_idx').on(table.contentId),
  index('app_content_sources_conv_idx').on(table.conversationId),
]);

// ===== CROSS INSIGHTS (app_cross_insights) =====
export const crossInsights = pgTable('app_cross_insights', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  pattern: text('pattern').notNull(),
  conversationIds: text('conversation_ids'),
  insightType: text('insight_type').notNull(),
  confidence: real('confidence').notNull(),
  status: text('status').notNull().default('new'),
  actionSuggestion: text('action_suggestion'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_cross_insights_status_idx').on(table.status),
  index('app_cross_insights_type_idx').on(table.insightType),
]);

// ===== CROSS INSIGHT CONVERSATIONS (M:N) =====
export const crossInsightConversations = pgTable('app_cross_insight_conversations', {
  id: text('id').primaryKey(),
  crossInsightId: text('cross_insight_id'),
  conversationId: text('conversation_id'),
  relevance: text('relevance'),
});

// ===== USER PROFILE (app_user_profile) =====
export const userProfile = pgTable('app_user_profile', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().default(''),
  bio: text('bio'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== PROJECTS (app_projects) =====
// Ideia viva: iniciar um projeto a partir de um card (Oportunidade/Insight/Conteúdo).
export const projects = pgTable('app_projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('ativo'), // ativo / pausado / arquivado
  sourceType: text('source_type'),                    // 'opportunity' / 'insight' / 'content'
  sourceId: text('source_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_projects_source_idx').on(table.sourceType, table.sourceId),
  index('app_projects_status_idx').on(table.status),
]);

// ===== PROJECT COLUMNS (app_project_columns) =====
export const projectColumns = pgTable('app_project_columns', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  position: real('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_project_columns_project_idx').on(table.projectId),
]);

// ===== PROJECT TASKS (app_project_tasks) =====
export const projectTasks = pgTable('app_project_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  columnId: text('column_id').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  kind: text('kind').notNull().default('manual'), // manual / ai:aprofundar / ai:plano / ai:riscos / ai:conteudo
  position: real('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('app_project_tasks_project_idx').on(table.projectId),
  index('app_project_tasks_column_idx').on(table.columnId),
]);

// ===== TYPE EXPORTS =====
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type ContentSource = typeof contentSources.$inferSelect;
export type NewContentSource = typeof contentSources.$inferInsert;
export type CrossInsight = typeof crossInsights.$inferSelect;
export type NewCrossInsight = typeof crossInsights.$inferInsert;
export type CrossInsightConversation = typeof crossInsightConversations.$inferSelect;
export type NewCrossInsightConversation = typeof crossInsightConversations.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectColumn = typeof projectColumns.$inferSelect;
export type NewProjectColumn = typeof projectColumns.$inferInsert;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type NewProjectTask = typeof projectTasks.$inferInsert;
