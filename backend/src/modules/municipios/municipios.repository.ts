import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { municipio } from "../../db/municipio.ts";

type Filtros = { estadoId?: number; nome?: string };

function where(filters: Filtros) {
  return and(
    isNull(municipio.deletedAt),
    filters.estadoId !== undefined ? eq(municipio.estadoId, filters.estadoId) : undefined,
    filters.nome ? ilike(municipio.nome, `%${escaparLike(filters.nome)}%`) : undefined,
  );
}

export default class MunicipiosRepository {
  async listar(filters: Filtros & { limit: number; offset: number }, tx: DbOrTx = db) {
    return tx
      .select({ id: municipio.id, nome: municipio.nome, estadoId: municipio.estadoId })
      .from(municipio)
      .where(where(filters))
      .orderBy(asc(municipio.nome), asc(municipio.id))
      .limit(filters.limit)
      .offset(filters.offset);
  }

  async contar(filters: Filtros, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(municipio)
      .where(where(filters));
    return row?.total ?? 0;
  }
}
