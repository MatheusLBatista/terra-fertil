import type { z } from "zod";
import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import { lerDocumento, respostaDeStream } from "../../lib/storage/upload.ts";
import VisitasService from "./visitas.service.ts";
import { lerFormAssinatura } from "../assinaturas/assinaturas.controller.ts";
import {
  ListVisitasQuerySchema,
  VisitaIdParamSchema,
  CreateVisitaSchema,
  UpdateVisitaSchema,
  PutEquipeSchema,
  AnexoIdParamSchema,
  AnexoFormSchema,
  PutDiagnosticoSchema,
  ItemVerificadoParamSchema,
  PutItemVerificadoSchema,
  PutAtividadeVerificadaSchema,
  AtividadeVerificadaParamSchema,
} from "./visitas.schema.ts";

/** Valida params + corpo JSON juntos (as issues dos dois saem no mesmo 400). */
async function parsear<P extends z.ZodTypeAny, B extends z.ZodTypeAny>(c: AppContext, params: P, body: B) {
  const p = params.safeParse(c.req.param());
  const b = body.safeParse(await lerJson(c));
  if (!p.success || !b.success) {
    return {
      erro: respostaValidacao(c, [
        ...(p.success ? [] : p.error.issues),
        ...(b.success ? [] : b.error.issues),
      ]),
    } as const;
  }
  return { params: p.data as z.infer<P>, body: b.data as z.infer<B> };
}

export default class VisitasController {
  private service = new VisitasService();

  listar = async (c: AppContext) => {
    const parsed = ListVisitasQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateVisitaSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const r = await parsear(c, VisitaIdParamSchema, UpdateVisitaSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.alterar(r.params.id, r.body)));
  };

  excluir = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Equipe ───────────────────────────────────────────────────────────────

  listarEquipe = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarEquipe(params.data.id)));
  };

  definirEquipe = async (c: AppContext) => {
    const r = await parsear(c, VisitaIdParamSchema, PutEquipeSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.definirEquipe(r.params.id, r.body)));
  };

  // ─── Anexos ───────────────────────────────────────────────────────────────

  listarAnexos = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarAnexos(params.data.id)));
  };

  enviarAnexo = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const arquivo = await lerDocumento(c);
    // O Hono guarda o corpo já lido: os campos de texto do multipart saem do mesmo parse
    const campos = await c.req.parseBody();
    const form = AnexoFormSchema.safeParse({
      legenda: typeof campos.legenda === "string" ? campos.legenda : undefined,
      entregaId: typeof campos.entregaId === "string" && campos.entregaId ? campos.entregaId : undefined,
      atividadeVerificadaId:
        typeof campos.atividadeVerificadaId === "string" && campos.atividadeVerificadaId
          ? campos.atividadeVerificadaId
          : undefined,
    });
    if (!form.success) return respostaValidacao(c, form.error.issues);
    return c.json(successResponse(await this.service.enviarAnexo(params.data.id, arquivo, form.data)), 201);
  };

  baixarAnexo = async (c: AppContext) => {
    const params = AnexoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const { nomeArquivo, ...obj } = await this.service.baixarAnexo(params.data.id, params.data.anexoId);
    return respostaDeStream(obj, { cacheControl: "private, no-store", nomeArquivo });
  };

  excluirAnexo = async (c: AppContext) => {
    const params = AnexoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirAnexo(params.data.id, params.data.anexoId);
    return c.body(null, 204);
  };

  // ─── Diagnóstico da propriedade ───────────────────────────────────────────

  diagnostico = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.diagnostico(params.data.id)));
  };

  salvarDiagnostico = async (c: AppContext) => {
    const r = await parsear(c, VisitaIdParamSchema, PutDiagnosticoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.salvarDiagnostico(r.params.id, r.body)));
  };

  // ─── Itens verificados ────────────────────────────────────────────────────

  listarItensVerificados = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarItensVerificados(params.data.id)));
  };

  verificarItem = async (c: AppContext) => {
    const r = await parsear(c, ItemVerificadoParamSchema, PutItemVerificadoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.verificarItem(r.params.id, r.params.entregaId, r.body)));
  };

  desfazerVerificacao = async (c: AppContext) => {
    const params = ItemVerificadoParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.desfazerVerificacao(params.data.id, params.data.entregaId);
    return c.body(null, 204);
  };

  // ─── Atividades verificadas ───────────────────────────────────────────────

  atividades = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.atividades(params.data.id)));
  };

  verificarAtividade = async (c: AppContext) => {
    const r = await parsear(c, VisitaIdParamSchema, PutAtividadeVerificadaSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.verificarAtividade(r.params.id, r.body)));
  };

  desfazerAtividade = async (c: AppContext) => {
    const params = AtividadeVerificadaParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.desfazerAtividade(params.data.id, params.data.verificacaoId);
    return c.body(null, 204);
  };

  // ─── Assinatura ───────────────────────────────────────────────────────────

  assinatura = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.assinatura(params.data.id)));
  };

  assinantes = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.assinantes(params.data.id)));
  };

  assinar = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const form = await lerFormAssinatura(c);
    if ("erro" in form) return form.erro;
    return c.json(successResponse(await this.service.assinar(params.data.id, form.dados, form.imagem)), 201);
  };

  imagemAssinatura = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const obj = await this.service.imagemAssinatura(params.data.id);
    return respostaDeStream(obj, { cacheControl: "private, no-store" });
  };

  removerAssinatura = async (c: AppContext) => {
    const params = VisitaIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.removerAssinatura(params.data.id);
    return c.body(null, 204);
  };
}
