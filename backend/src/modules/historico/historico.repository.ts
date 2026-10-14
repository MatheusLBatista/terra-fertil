import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { historicoAlteracao, type HistoricoAlteracao } from "../../db/historicoAlteracao.ts";

type Filtros = {
  tabela?: string;
  registroId?: string;
  operacao?: HistoricoAlteracao["operacao"];
  alteradoPor?: string;
};

function where(filters: Filtros) {
  return and(
    filters.tabela ? eq(historicoAlteracao.tabela, filters.tabela) : undefined,
    filters.registroId ? eq(historicoAlteracao.registroId, filters.registroId) : undefined,
    filters.operacao ? eq(historicoAlteracao.operacao, filters.operacao) : undefined,
    filters.alteradoPor ? eq(historicoAlteracao.alteradoPor, filters.alteradoPor) : undefined,
  );
}

export default class HistoricoRepository {
  async listar(filters: Filtros & { limit: number; offset: number }) {
    return db
      .select()
      .from(historicoAlteracao)
      .where(where(filters))
      .orderBy(desc(historicoAlteracao.alteradoEm), desc(historicoAlteracao.id))
      .limit(filters.limit)
      .offset(filters.offset);
  }

  async contar(filters: Filtros) {
    const [row] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(historicoAlteracao)
      .where(where(filters));
    return row?.total ?? 0;
  }

  async listarTabelas() {
    const rows = await db
      .selectDistinct({ tabela: historicoAlteracao.tabela })
      .from(historicoAlteracao)
      .orderBy(historicoAlteracao.tabela);
    return rows.map((r) => r.tabela);
  }
}
