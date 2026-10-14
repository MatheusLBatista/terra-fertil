import type { z } from "zod";
import HistoricoRepository from "./historico.repository.ts";
import { type ListHistoricoQuerySchema } from "./historico.schema.ts";

type ListQuery = z.infer<typeof ListHistoricoQuerySchema>;

export default class HistoricoService {
  private repository = new HistoricoRepository();

  async listar(query: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    return { itens, total };
  }

  async listarTabelas() {
    return this.repository.listarTabelas();
  }
}
