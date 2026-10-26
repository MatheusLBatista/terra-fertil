import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import OpcoesDiagnosticoService from "./opcoesDiagnostico.service.ts";
import {
  ListOpcoesDiagnosticoQuerySchema,
  OpcaoDiagnosticoIdParamSchema,
  CreateOpcaoDiagnosticoSchema,
  UpdateOpcaoDiagnosticoSchema,
  SubdivisaoIdParamSchema,
  CreateSubdivisaoSchema,
  UpdateSubdivisaoSchema,
} from "./opcoesDiagnostico.schema.ts";

export default class OpcoesDiagnosticoController {
  private service = new OpcoesDiagnosticoService();

  listar = async (c: AppContext) => {
    const parsed = ListOpcoesDiagnosticoQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = OpcaoDiagnosticoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateOpcaoDiagnosticoSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const params = OpcaoDiagnosticoIdParamSchema.safeParse(c.req.param());
    const body = UpdateOpcaoDiagnosticoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.alterar(params.data.id, body.data)));
  };

  excluir = async (c: AppContext) => {
    const params = OpcaoDiagnosticoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Subdivisões ──────────────────────────────────────────────────────────

  listarSubdivisoes = async (c: AppContext) => {
    const params = OpcaoDiagnosticoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarSubdivisoes(params.data.id)));
  };

  inserirSubdivisao = async (c: AppContext) => {
    const params = OpcaoDiagnosticoIdParamSchema.safeParse(c.req.param());
    const body = CreateSubdivisaoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.criarSubdivisao(params.data.id, body.data)), 201);
  };

  alterarSubdivisao = async (c: AppContext) => {
    const params = SubdivisaoIdParamSchema.safeParse(c.req.param());
    const body = UpdateSubdivisaoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    const { id, subdivisaoId } = params.data;
    return c.json(successResponse(await this.service.alterarSubdivisao(id, subdivisaoId, body.data)));
  };

  excluirSubdivisao = async (c: AppContext) => {
    const params = SubdivisaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirSubdivisao(params.data.id, params.data.subdivisaoId);
    return c.body(null, 204);
  };
}
