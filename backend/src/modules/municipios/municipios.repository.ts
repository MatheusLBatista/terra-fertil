import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db, escaparLike } from "../../db/index.ts";
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
  async listar(filters: Filtros & { limit: number; offset: number }) {
    return db
      .select({ id: municipio.id, nome: municipio.nome, estadoId: municipio.estadoId })
      .from(municipio)
      .where(where(filters))
      .orderBy(asc(municipio.nome), asc(municipio.id))
      .limit(filters.limit)
      .offset(filters.offset);
  }

  async contar(filters: Filtros) {
    const [row] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(municipio)
      .where(where(filters));
    return row?.total ?? 0;
  }
}
