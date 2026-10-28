import { successResponse } from "../../lib/response.ts";
import type { AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import DashboardService from "./dashboard.service.ts";
import { DashboardGestaoQuerySchema, DashboardTecnicoQuerySchema } from "./dashboard.schema.ts";

export default class DashboardController {
  private service = new DashboardService();

  gestao = async (c: AppContext) => {
    const parsed = DashboardGestaoQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.gestao(parsed.data)));
  };

  tecnico = async (c: AppContext) => {
    const parsed = DashboardTecnicoQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.tecnico(parsed.data)));
  };
}
