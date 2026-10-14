import { successResponse } from "../../lib/response.ts";
import type { AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import MunicipiosService from "./municipios.service.ts";
import { ListMunicipiosQuerySchema } from "./municipios.schema.ts";

export default class MunicipiosController {
  private service = new MunicipiosService();

  listar = async (c: AppContext) => {
    const parsed = ListMunicipiosQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };
}
