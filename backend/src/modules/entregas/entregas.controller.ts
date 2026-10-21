import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import { lerDocumento, respostaDeStream } from "../../lib/storage/upload.ts";
import EntregasService from "./entregas.service.ts";
import {
  ListEntregasQuerySchema,
  EntregaIdParamSchema,
  CreateEntregaSchema,
  UpdateEntregaSchema,
} from "./entregas.schema.ts";

export default class EntregasController {
  private service = new EntregasService();

  listar = async (c: AppContext) => {
    const parsed = ListEntregasQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateEntregaSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    const body = UpdateEntregaSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.alterar(params.data.id, body.data)));
  };

  excluir = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Termo de uso ─────────────────────────────────────────────────────────

  enviarTermoUso = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const arquivo = await lerDocumento(c);
    return c.json(successResponse(await this.service.enviarTermoUso(params.data.id, arquivo)));
  };

  baixarTermoUso = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const { obj, nome } = await this.service.baixarTermoUso(params.data.id);
    return respostaDeStream(obj, { cacheControl: "private, no-store", nomeArquivo: nome });
  };

  removerTermoUso = async (c: AppContext) => {
    const params = EntregaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.removerTermoUso(params.data.id);
    return c.body(null, 204);
  };
}
