import { successResponse } from "../../lib/response.ts";
import { lerJson, type AppContext } from "../../lib/hono.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import { lerDocumento, respostaDeStream } from "../../lib/storage/upload.ts";
import AssociacoesService from "./associacoes.service.ts";
import { lerFormAssinatura } from "../assinaturas/assinaturas.controller.ts";
import {
  ListAssociacoesQuerySchema,
  AssociacaoIdParamSchema,
  CreateAssociacaoSchema,
  UpdateAssociacaoSchema,
  ContatoIdParamSchema,
  CreateContatoSchema,
  UpdateContatoSchema,
  DocumentoIdParamSchema,
  CreateDocumentoSchema,
  UpdateDocumentoSchema,
  PutDiagnosticoSchema,
} from "./associacoes.schema.ts";
import type { z } from "zod";

/** params + body validados juntos (400 com as issues dos dois). */
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
  return { params: p.data as z.infer<P>, body: b.data as z.infer<B> } as const;
}

export default class AssociacoesController {
  private service = new AssociacoesService();

  listar = async (c: AppContext) => {
    const parsed = ListAssociacoesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    const { itens, total } = await this.service.listar(parsed.data);
    return c.json(successResponse(itens, { total, limit: parsed.data.limit, offset: parsed.data.offset }));
  };

  listarPorId = async (c: AppContext) => {
    const params = AssociacaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarPorId(params.data.id)));
  };

  inserir = async (c: AppContext) => {
    const parsed = CreateAssociacaoSchema.safeParse(await lerJson(c));
    if (!parsed.success) return respostaValidacao(c, parsed.error.issues);
    return c.json(successResponse(await this.service.criar(parsed.data)), 201);
  };

  alterar = async (c: AppContext) => {
    const r = await parsear(c, AssociacaoIdParamSchema, UpdateAssociacaoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.alterar(r.params.id, r.body)));
  };

  excluir = async (c: AppContext) => {
    const params = AssociacaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluir(params.data.id);
    return c.body(null, 204);
  };

  // ─── Contatos ─────────────────────────────────────────────────────────────

  listarContatos = async (c: AppContext) => {
    const params = AssociacaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarContatos(params.data.id)));
  };

  incluirContato = async (c: AppContext) => {
    const r = await parsear(c, AssociacaoIdParamSchema, CreateContatoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.incluirContato(r.params.id, r.body)), 201);
  };

  alterarContato = async (c: AppContext) => {
    const r = await parsear(c, ContatoIdParamSchema, UpdateContatoSchema);
    if ("erro" in r) return r.erro;
    return c.json(
      successResponse(await this.service.alterarContato(r.params.id, r.params.contatoId, r.body)),
    );
  };

  excluirContato = async (c: AppContext) => {
    const params = ContatoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirContato(params.data.id, params.data.contatoId);
    return c.body(null, 204);
  };

  // ─── Documentos ───────────────────────────────────────────────────────────

  listarDocumentos = async (c: AppContext) => {
    const params = AssociacaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.listarDocumentos(params.data.id)));
  };

  incluirDocumento = async (c: AppContext) => {
    const r = await parsear(c, AssociacaoIdParamSchema, CreateDocumentoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.incluirDocumento(r.params.id, r.body)), 201);
  };

  alterarDocumento = async (c: AppContext) => {
    const r = await parsear(c, DocumentoIdParamSchema, UpdateDocumentoSchema);
    if ("erro" in r) return r.erro;
    return c.json(
      successResponse(await this.service.alterarDocumento(r.params.id, r.params.documentoId, r.body)),
    );
  };

  excluirDocumento = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.excluirDocumento(params.data.id, params.data.documentoId);
    return c.body(null, 204);
  };

  enviarArquivo = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const arquivo = await lerDocumento(c);
    return c.json(
      successResponse(await this.service.enviarArquivo(params.data.id, params.data.documentoId, arquivo)),
    );
  };

  baixarArquivo = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const { nomeArquivo, ...obj } = await this.service.baixarArquivo(params.data.id, params.data.documentoId);
    return respostaDeStream(obj, { cacheControl: "private, no-store", nomeArquivo });
  };

  // ─── Assinatura do documento ──────────────────────────────────────────────

  assinatura = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.assinatura(params.data.id, params.data.documentoId)));
  };

  assinar = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    const form = await lerFormAssinatura(c);
    if ("erro" in form) return form.erro;
    const { id, documentoId } = params.data;
    return c.json(successResponse(await this.service.assinar(id, documentoId, form.dados, form.imagem)), 201);
  };

  imagemAssinatura = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return respostaDeStream(await this.service.imagemAssinatura(params.data.id, params.data.documentoId), {
      cacheControl: "private, no-store",
    });
  };

  removerAssinatura = async (c: AppContext) => {
    const params = DocumentoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    await this.service.removerAssinatura(params.data.id, params.data.documentoId);
    return c.body(null, 204);
  };

  // ─── Diagnóstico ──────────────────────────────────────────────────────────

  diagnostico = async (c: AppContext) => {
    const params = AssociacaoIdParamSchema.safeParse(c.req.param());
    if (!params.success) return respostaValidacao(c, params.error.issues);
    return c.json(successResponse(await this.service.diagnostico(params.data.id)));
  };

  salvarDiagnostico = async (c: AppContext) => {
    const r = await parsear(c, AssociacaoIdParamSchema, PutDiagnosticoSchema);
    if ("erro" in r) return r.erro;
    return c.json(successResponse(await this.service.salvarDiagnostico(r.params.id, r.body)));
  };
}
