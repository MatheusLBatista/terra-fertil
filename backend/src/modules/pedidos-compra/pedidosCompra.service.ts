import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto } from "../../lib/escopo.ts";
import PedidosCompraRepository from "./pedidosCompra.repository.ts";
import type {
  ListPedidosCompraQuerySchema,
  CreatePedidoCompraSchema,
  UpdatePedidoCompraSchema,
} from "./pedidosCompra.schema.ts";

type ListQuery = z.infer<typeof ListPedidosCompraQuerySchema>;
type CreateData = z.infer<typeof CreatePedidoCompraSchema>;
type UpdateData = z.infer<typeof UpdatePedidoCompraSchema>;

export default class PedidosCompraService {
  private repository = new PedidosCompraRepository();

  async listar(query: ListQuery) {
    if (query.projetoId) await garantirProjeto(query.projetoId);
    const escopo = await escopoAtual();
    const filtros = { ...query, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const pedido = await this.repository.porId(id, await escopoAtual());
    if (!pedido) throw new AppError("Pedido de compra não encontrado", 404);
    return pedido;
  }

  async criar(data: CreateData) {
    await garantirProjeto(data.projetoId, { escrita: true });
    await this.garantirNumeroLivre(data.numero);
    const { id } = await this.repository.inserir(data);
    return this.listarPorId(id);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if (data.numero && data.numero !== atual.numero) await this.garantirNumeroLivre(data.numero);
    const alterado = await this.repository.alterar(id, data);
    if (!alterado) throw new AppError("Pedido de compra não encontrado", 404);
    return this.listarPorId(id);
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if ((await this.repository.contarEntregas(id)) > 0) {
      throw new AppError(
        `O pedido ${atual.numero} tem entregas ligadas — desvincule-as ou cancele o pedido em vez de excluir`,
        409,
        undefined,
        "PEDIDO_EM_USO",
      );
    }
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Pedido de compra não encontrado", 404);
  }

  private async garantirNumeroLivre(numero: string) {
    if (await this.repository.porNumero(numero)) {
      throw new AppError(`Já existe um pedido de compra nº ${numero}`, 409, undefined, "PEDIDO_DUPLICADO");
    }
  }
}
