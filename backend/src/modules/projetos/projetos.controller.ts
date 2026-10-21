import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import ProjetosService from "./projetos.service.ts";
import {
  ListProjetosQuerySchema,
  ProjetoIdParamSchema,
  CreateProjetoSchema,
  UpdateProjetoSchema,
  MembroIdParamSchema,
  CreateMembroSchema,
  UpdateMembroSchema,
  AdesaoIdParamSchema,
  ListAdesoesQuerySchema,
  CreateAdesaoSchema,
  UpdateAdesaoSchema,
} from "./projetos.schema.ts";

export default class ProjetosController {
  private service = new ProjetosService();

  listar = async (c: AppContext) => {
    const parsed = ListProjetosQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateProjetoSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    const body = UpdateProjetoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.alterar(params.data.id, body.data)));
  };

  excluir = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Equipe ───────────────────────────────────────────────────────────────

  listarEquipe = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarEquipe(params.data.id)));
  };

  incluirMembro = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    const body = CreateMembroSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.incluirMembro(params.data.id, body.data)), 201);
  };

  alterarMembro = async (c: AppContext) => {
    const params = MembroIdParamSchema.safeParse(c.req.param());
    const body = UpdateMembroSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(
      successResponse(await this.service.alterarMembro(params.data.id, params.data.membroId, body.data)),
    );
  };

  excluirMembro = async (c: AppContext) => {
    const params = MembroIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirMembro(params.data.id, params.data.membroId);
    return c.body(null, 204);
  };

  // ─── Adesões ──────────────────────────────────────────────────────────────

  listarAdesoes = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    const query = ListAdesoesQuerySchema.safeParse(c.req.query());
    if (!params.success || !query.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(query.success ? [] : query.error.issues),
      ]);
    }
    const { itens, total } = await this.service.listarAdesoes(params.data.id, query.data);
    return c.json(successResponse(itens, { total, limit: query.data.limit, offset: query.data.offset }));
  };

  incluirAdesao = async (c: AppContext) => {
    const params = ProjetoIdParamSchema.safeParse(c.req.param());
    const body = CreateAdesaoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(successResponse(await this.service.incluirAdesao(params.data.id, body.data)), 201);
  };

  alterarAdesao = async (c: AppContext) => {
    const params = AdesaoIdParamSchema.safeParse(c.req.param());
    const body = UpdateAdesaoSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) {
      return respostaValidacao(c, [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]);
    }
    return c.json(
      successResponse(await this.service.alterarAdesao(params.data.id, params.data.adesaoId, body.data)),
    );
  };

  excluirAdesao = async (c: AppContext) => {
    const params = AdesaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirAdesao(params.data.id, params.data.adesaoId);
    return c.body(null, 204);
  };
}
