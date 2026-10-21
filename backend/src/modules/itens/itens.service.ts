import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import ItensRepository from "./itens.repository.ts";
import type { ListItensQuerySchema, CreateItemSchema, UpdateItemSchema } from "./itens.schema.ts";

type ListQuery = z.infer<typeof ListItensQuerySchema>;
type CreateData = z.infer<typeof CreateItemSchema>;
type UpdateData = z.infer<typeof UpdateItemSchema>;

export default class ItensService {
  private repository = new ItensRepository();

  async listar(query: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const encontrado = await this.repository.porId(id);
    if (!encontrado) throw new AppError("Item não encontrado", 404);
    return encontrado;
  }

  async criar(data: CreateData) {
    await this.garantirDescricaoLivre(data.descricao);
    return this.repository.inserir(data);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    if (data.descricao && data.descricao.toLowerCase() !== atual.descricao.toLowerCase()) {
      await this.garantirDescricaoLivre(data.descricao, id);
    }
    const alterado = await this.repository.alterar(id, data);
    if (!alterado) throw new AppError("Item não encontrado", 404);
    return alterado;
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    const entregas = await this.repository.contarEntregas(id);
    if (entregas > 0) {
      throw new AppError(
        `"${atual.descricao}" já tem ${entregas} entrega(s) registrada(s) — desative-o em vez de excluir`,
        409,
        undefined,
        "ITEM_EM_USO",
      );
    }
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Item não encontrado", 404);
  }

  private async garantirDescricaoLivre(descricao: string, excetoId?: string) {
    if (await this.repository.porDescricao(descricao, excetoId)) {
      throw new AppError(`Já existe um item "${descricao}"`, 409, undefined, "ITEM_DUPLICADO");
    }
  }
}
