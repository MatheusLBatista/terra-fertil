import { successResponse } from "../../lib/response.ts";
import type { AppContext } from "../../lib/hono.ts";
import EstadosService from "./estados.service.ts";

export default class EstadosController {
  private service = new EstadosService();

  listar = async (c: AppContext) => {
    const itens = await this.service.listar();
    return c.json(successResponse(itens, { total: itens.length }));
  };
}
