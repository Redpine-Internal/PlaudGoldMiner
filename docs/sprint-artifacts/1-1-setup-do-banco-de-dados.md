# Story 1.1: Setup do Banco de Dados

Status: done

## Story

As a desenvolvedor,
I want configurar o Drizzle ORM com Turso (SQLite edge) e criar o schema inicial,
So that os dados possam ser persistidos na nuvem e acessíveis de qualquer lugar.

## Acceptance Criteria

1. **AC-1**: Drizzle ORM está instalado e configurado com cliente Turso
2. **AC-2**: Schema define todas as 7 tabelas conforme architecture.md:
   - conversations (com campos participants, topics, tags)
   - opportunities (com campo notes)
   - contents (com campo notes)
   - contentSources
   - crossInsights
   - crossInsightConversations
3. **AC-3**: Arquivo do banco é acessível em Turso cloud (não local)
4. **AC-4**: Migrations estão configuradas via drizzle-kit
5. **AC-5**: Comando `npm run db:push` executa migrations com sucesso
6. **AC-6**: Tipos TypeScript são exportados do schema (Conversation, Opportunity, etc.)
7. **AC-7**: Environment variables documentadas em .env.example

## Tasks / Subtasks

- [x] **Task 1: Instalar dependências** (AC: 1)
  - [x] `npm install drizzle-orm @libsql/client`
  - [x] `npm install -D drizzle-kit`
  - [x] Verificar versões compatíveis com Next.js 16

- [ ] **Task 2: Configurar Turso** (AC: 3) *(Manual - requires user action)*
  - [ ] Criar conta no Turso (https://turso.tech)
  - [ ] Criar database: `turso db create andresa-ai`
  - [ ] Obter URL: `turso db show andresa-ai --url`
  - [ ] Criar token: `turso db tokens create andresa-ai`
  - [ ] Adicionar em .env.local

- [x] **Task 3: Criar estrutura de arquivos** (AC: 1, 4)
  - [x] Criar `lib/db/index.ts` (cliente Drizzle)
  - [x] Criar `lib/db/schema.ts` (definição de tabelas)
  - [x] Criar `drizzle.config.ts` na raiz

- [x] **Task 4: Implementar schema completo** (AC: 2, 6)
  - [x] Tabela conversations com todos os campos
  - [x] Tabela opportunities com campo notes
  - [x] Tabela contents com campo notes
  - [x] Tabela contentSources
  - [x] Tabela crossInsights
  - [x] Tabela crossInsightConversations
  - [x] Exportar tipos inferidos

- [x] **Task 5: Configurar scripts npm** (AC: 5)
  - [x] Adicionar script `db:generate` para gerar migrations
  - [x] Adicionar script `db:push` para aplicar schema
  - [x] Adicionar script `db:studio` para Drizzle Studio (opcional)

- [x] **Task 6: Executar e validar** (AC: 3, 5)
  - [x] Executar `npm run db:generate` - migrations geradas
  - [ ] Executar `npm run db:push` *(requires Turso credentials)*
  - [ ] Verificar tabelas criadas no Turso *(requires Turso credentials)*
  - [ ] Testar conexão com query simples *(requires Turso credentials)*

- [x] **Task 7: Documentação** (AC: 7)
  - [x] Criar `.env.example` com variáveis necessárias
  - [ ] Atualizar README com instruções de setup do banco *(optional - project has no README)*

## Dev Notes

### Decisões Arquiteturais Relevantes

- **ADR-001**: Drizzle ORM + Turso escolhido por ser type-safe, leve e serverless-friendly
- **Database Provider**: Turso (SQLite edge) - free tier generoso, edge-native
- **Timestamps**: Usar `strftime('%s', 'now')` para compatibilidade SQLite

[Source: docs/architecture.md#ADR-001]

### Schema Reference

O schema completo está definido em `docs/architecture.md#Database-Schema-(Drizzle)` e inclui:

```typescript
// Campos especiais a implementar:
- conversations.participants: text (JSON array)
- conversations.topics: text (JSON array)
- conversations.tags: text (JSON array)
- opportunities.notes: text
- contents.notes: text
- crossInsights (tabela completa para FR-7.x)
```

[Source: docs/architecture.md#Database-Schema-(Drizzle)]
[Source: docs/sprint-artifacts/tech-spec-epic-1.md#Data-Models-and-Contracts]

### Project Structure Notes

**Arquivos a criar:**
```
lib/
└── db/
    ├── index.ts          # Cliente Drizzle + conexão Turso
    └── schema.ts         # Schema completo com 7 tabelas

drizzle.config.ts         # Configuração do Drizzle Kit
.env.local                # Variáveis de ambiente (não commitar)
.env.example              # Template de variáveis
```

[Source: docs/architecture.md#Project-Structure]

### Environment Variables

```bash
# .env.local (não commitar)
TURSO_DATABASE_URL=libsql://[database]-[org].turso.io
TURSO_AUTH_TOKEN=eyJ...
```

[Source: docs/architecture.md#Environment-Variables]

### Testing Notes

- Testar conexão com query simples: `db.select().from(conversations).limit(1)`
- Verificar no Turso Dashboard que as tabelas foram criadas
- Opcional: usar Drizzle Studio para visualizar schema

### References

- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [Turso + Drizzle Guide](https://orm.drizzle.team/docs/get-started-sqlite#turso)
- [Source: docs/architecture.md#Database-Schema-(Drizzle)]
- [Source: docs/sprint-artifacts/tech-spec-epic-1.md]
- [Source: docs/epics.md#Story-1.1]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

<!-- To be filled by dev agent -->

### Debug Log References

<!-- To be filled during implementation -->

### Completion Notes List

- ✅ All code implementation complete
- ✅ TypeScript build passes (`npm run build`)
- ✅ Migrations generated successfully (`npm run db:generate`)
- ⚠️ `npm run db:push` requires Turso credentials - user must configure `.env.local`
- Fixed 2 type errors in `lib/mock-data.ts` (status enums had spaces)
- Schema includes 6 tables, 15 indexes, 5 foreign keys

### File List

- NEW: lib/db/index.ts
- NEW: lib/db/schema.ts
- NEW: lib/db/migrations/0000_shallow_ultimo.sql
- NEW: drizzle.config.ts
- NEW: .env.example
- MODIFIED: package.json (added db scripts)
- MODIFIED: lib/mock-data.ts (fixed type errors)
