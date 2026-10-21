import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import PedidosCompraService from "./pedidosCompra.service.ts";
import {
  ListPedidosCompraQuerySchema,
  PedidoCompraIdParamSchema,
  CreatePedidoCompraSchema,
  UpdatePedidoCompraSchema,
} from "./pedidosCompra.schema.ts";

export default class PedidosCompraController {
  private service = new PedidosCompraService();

  listar = async (c: AppContext) => {
    const parsed = ListPedidosCompraQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = PedidoCompraIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreatePedidoCompraSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const params = PedidoCompraIdParamSchema.safeParse(c.req.param());
    const body = UpdatePedidoCompraSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.alterar(params.data.id, body.data)));
  };

  excluir = async (c: AppContext) => {
    const params = PedidoCompraIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };
}
