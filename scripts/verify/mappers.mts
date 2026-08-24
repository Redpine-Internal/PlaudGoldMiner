import assert from 'node:assert/strict';
import {
  mapBusinessOpportunities,
  mapSocialPosts,
  mapArticleInsights,
} from '@/lib/n8n/mappers';

// ---- business_opportunities: achatamento 1→N ----
const boRows = [
  {
    id: 'row-A',
    meeting_ids: ['m1', 'm2'],
    created_at: '2026-08-24T10:00:00Z',
    opportunities: [
      { title: 'Op1', pain: 'dor1', context: 'ctx1', score: 80, type: 'produto' },
      { id: 'own-2', title: 'Op2' }, // campos faltando + id próprio
    ],
  },
  { id: 'row-B', meeting_ids: [], created_at: '2026-08-24T09:00:00Z', opportunities: [] }, // vazio
  { id: 'row-C', meeting_ids: null, created_at: '2026-08-24T08:00:00Z', opportunities: null }, // não-array
];
const opps = mapBusinessOpportunities(boRows);
assert.equal(opps.length, 2, 'só a linha A tem itens');
assert.equal(opps[0].id, 'row-A:0', 'id sintético linha:índice');
assert.equal(opps[0].title, 'Op1');
assert.equal(opps[0].pain, 'dor1');
assert.equal(opps[0].score, 80);
assert.equal(opps[0].conversationId, 'm1', 'liga ao 1º meeting');
assert.equal(opps[0].status, 'nova', 'default de status');
assert.equal(opps[1].id, 'own-2', 'usa id próprio do item quando existe');
assert.equal(opps[1].title, 'Op2');
assert.equal(opps[1].pain, '', 'campo faltando vira string vazia');
assert.equal(opps[1].score, 0, 'score faltando vira 0');
assert.equal(opps[1].type, 'produto', 'type default');
assert.equal(opps[1].conversationId, 'm1');

// ---- social_posts: 1 linha = 1 card ----
const spRows = [
  {
    id: 'sp-1', meeting_ids: ['m9'], created_at: '2026-08-24T10:00:00Z',
    platform: 'linkedin', content_type: 'post', title: 'T', body: 'B',
    hashtags: ['#a', '#b'], image_prompt: 'draw',
  },
  { id: 'sp-2', meeting_ids: null, created_at: '2026-08-24T09:00:00Z' }, // campos faltando
];
const contents = mapSocialPosts(spRows);
assert.equal(contents.length, 2);
assert.equal(contents[0].id, 'sp-1');
assert.equal(contents[0].platform, 'linkedin');
assert.equal(contents[0].theme, 'post', 'content_type → theme');
assert.equal(contents[0].relevanceScore, 0);
assert.equal(contents[0].status, 'sugerido');
assert.equal(contents[0].conversationId, 'm9');
const outline0 = JSON.parse(contents[0].outline);
assert.deepEqual(outline0.hashtags, ['#a', '#b']);
assert.equal(outline0.body, 'B');
assert.equal(contents[1].platform, '', 'platform faltando vira string vazia');
assert.equal(contents[1].conversationId, null);

// ---- article_insights: 1 linha = 1 card ----
const aiRows = [
  {
    id: 'ai-1', meeting_ids: ['m3', 'm4'], created_at: '2026-08-24T10:00:00Z',
    title: 'Artigo', abstract_text: 'resumo', focus_area: 'seguranca',
  },
  { id: 'ai-2', meeting_ids: null, created_at: '2026-08-24T09:00:00Z' }, // campos faltando
];
const insights = mapArticleInsights(aiRows);
assert.equal(insights.length, 2);
assert.equal(insights[0].id, 'ai-1');
assert.equal(insights[0].title, 'Artigo');
assert.equal(insights[0].description, 'resumo', 'abstract_text → description');
assert.equal(insights[0].pattern, 'seguranca', 'focus_area → pattern');
assert.equal(insights[0].insightType, 'seguranca', 'focus_area → insightType');
assert.equal(insights[0].confidence, 0);
assert.equal(insights[0].status, 'new');
assert.deepEqual(JSON.parse(insights[0].conversationIds), ['m3', 'm4']);
assert.equal(insights[1].title, '', 'title faltando vira string vazia');
assert.equal(insights[1].pattern, 'geral', 'focus_area faltando → geral');

console.log('OK mappers');
