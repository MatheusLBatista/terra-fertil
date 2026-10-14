import { successResponse } from "../../lib/response.ts";
import type { AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import HistoricoService from "./historico.service.ts";
import { ListHistoricoQuerySchema } from "./historico.schema.ts";

export default class HistoricoController {
  private service = new HistoricoService();

  listar = async (c: AppContext) => {
    const parsed = ListHistoricoQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarTabelas = async (c: AppContext) => {
    const tabelas = await this.service.listarTabelas();
    return c.json(successResponse(tabelas));
  };
}
