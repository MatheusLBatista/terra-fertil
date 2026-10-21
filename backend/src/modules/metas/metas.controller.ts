import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import MetasService from "./metas.service.ts";
import {
  ListMetasQuerySchema,
  MetaIdParamSchema,
  IndicadorIdParamSchema,
  EtapaIdParamSchema,
  CreateMetaSchema,
  UpdateMetaSchema,
  CreateIndicadorSchema,
  UpdateIndicadorSchema,
  CreateEtapaSchema,
  UpdateEtapaSchema,
  QuantidadeManualSchema,
} from "./metas.schema.ts";

type Issues = Parameters<typeof respostaValidacao>[1];
const issuesDe = (...resultados: { success: boolean; error?: { issues: Issues } }[]): Issues =>
  resultados.flatMap((r) => (r.success ? [] : (r.error?.issues ?? [])));

export default class MetasController {
  private service = new MetasService();

  listar = async (c: AppContext) => {
    const parsed = ListMetasQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, ...meta } = await this.service.listar(parsed.data.projetoId);
    return c.json(successResponse(itens, meta));
  };

  chaves = async (c: AppContext) => c.json(successResponse(this.service.chaves()));

  listarPorId = async (c: AppContext) => {
    const params = MetaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateMetaSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { meta, avisos } = await this.service.criar(parsed.data);
    return c.json(successResponse(meta, { avisos }), 201);
  };

  alterar = async (c: AppContext) => {
    const params = MetaIdParamSchema.safeParse(c.req.param());
    const body = UpdateMetaSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    const { meta, avisos } = await this.service.alterar(params.data.id, body.data);
    return c.json(successResponse(meta, { avisos }));
  };

  excluir = async (c: AppContext) => {
    const params = MetaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Indicadores ──────────────────────────────────────────────────────────

  inserirIndicador = async (c: AppContext) => {
    const params = MetaIdParamSchema.safeParse(c.req.param());
    const body = CreateIndicadorSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    return c.json(successResponse(await this.service.criarIndicador(params.data.id, body.data)), 201);
  };

  alterarIndicador = async (c: AppContext) => {
    const params = IndicadorIdParamSchema.safeParse(c.req.param());
    const body = UpdateIndicadorSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    return c.json(successResponse(await this.service.alterarIndicador(params.data.indicadorId, body.data)));
  };

  excluirIndicador = async (c: AppContext) => {
    const params = IndicadorIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirIndicador(params.data.indicadorId);
    return c.body(null, 204);
  };

  // ─── Etapas ───────────────────────────────────────────────────────────────

  inserirEtapa = async (c: AppContext) => {
    const params = IndicadorIdParamSchema.safeParse(c.req.param());
    const body = CreateEtapaSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    return c.json(successResponse(await this.service.criarEtapa(params.data.indicadorId, body.data)), 201);
  };

  alterarEtapa = async (c: AppContext) => {
    const params = EtapaIdParamSchema.safeParse(c.req.param());
    const body = UpdateEtapaSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    return c.json(successResponse(await this.service.alterarEtapa(params.data.etapaId, body.data)));
  };

  registrarQuantidade = async (c: AppContext) => {
    const params = EtapaIdParamSchema.safeParse(c.req.param());
    const body = QuantidadeManualSchema.safeParse(await lerJson(c));
    if (!params.success || !body.success) return respostaValidacao(c, issuesDe(params, body));
    return c.json(
      successResponse(
        await this.service.registrarQuantidade(params.data.etapaId, body.data.quantidadeManual),
      ),
    );
  };

  excluirEtapa = async (c: AppContext) => {
    const params = EtapaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirEtapa(params.data.etapaId);
    return c.body(null, 204);
  };
}
