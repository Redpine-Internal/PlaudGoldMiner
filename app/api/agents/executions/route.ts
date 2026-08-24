import { NextRequest, NextResponse } from 'next/server';
import type { QueryResult } from 'pg';
import { pool } from '@/lib/db';

// Interface para as colunas selecionadas da tabela agent_executions.
// input_params é omitido para manter o payload leve.
interface AgentExecutionRow {
  id: string;
  agent_name: string;
  triggered_by: string;
  meeting_ids: string[];
  status: string;
  result_id: string | null;
  result_table: string | null;
  created_at: string;
  completed_at: string | null;
}

const EXECUTION_COLUMNS = 'id, agent_name, triggered_by, meeting_ids, status, result_id, result_table, created_at, completed_at';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Filtro opcional por nome de agente
    const agent = searchParams.get('agent');

    // Limite com clamping entre 1 e 100, padrão 20
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    let res: QueryResult<AgentExecutionRow>;
    if (agent) {
      // Filtra pelo nome do agente fornecido
      res = await pool.query<AgentExecutionRow>(
        `SELECT ${EXECUTION_COLUMNS}
           FROM agent_executions
          WHERE agent_name = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [agent, limit]
      );
    } else {
      // Retorna todas as execuções recentes sem filtro
      res = await pool.query<AgentExecutionRow>(
        `SELECT ${EXECUTION_COLUMNS}
           FROM agent_executions
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit]
      );
    }

    return NextResponse.json({ data: res.rows });
  } catch (error) {
    console.error('[API] GET /api/agents/executions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
