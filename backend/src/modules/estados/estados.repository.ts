import { asc, isNull } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { estado } from "../../db/estado.ts";

export default class EstadosRepository {
  async listar() {
    return db
      .select({ id: estado.id, nome: estado.nome, sigla: estado.sigla })
      .from(estado)
      .where(isNull(estado.deletedAt))
      .orderBy(asc(estado.nome));
  }
}
