import type { z } from "zod";
import MunicipiosRepository from "./municipios.repository.ts";
import { type ListMunicipiosQuerySchema } from "./municipios.schema.ts";

type ListQuery = z.infer<typeof ListMunicipiosQuerySchema>;

export default class MunicipiosService {
  private repository = new MunicipiosRepository();

  async listar(query: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    return { itens, total };
  }
}
