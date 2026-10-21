import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import PessoasService from "./pessoas.service.ts";
import { ListPessoasQuerySchema, NovaPessoaSchema } from "./pessoas.schema.ts";

export default class PessoasController {
  private service = new PessoasService();

  buscar = async (c: AppContext) => {
    const parsed = ListPessoasQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.buscar(parsed.data)));
  };

  inserir = async (c: AppContext) => {
    const parsed = NovaPessoaSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };
}
