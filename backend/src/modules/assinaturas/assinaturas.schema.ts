import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { assinantePapelEnum } from "../../db/enums.ts";
import {
  ERROS,
  ERROS_ESCRITA,
  ERROS_LEITURA,
  SEGURANCA,
  criado,
  erro,
  ok,
  okLista,
  semConteudo,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const PAPEIS_ASSINANTE = assinantePapelEnum.enumValues;
/** A imagem é um PNG pequeno (traço numa área de assinatura). */
export const MAX_IMAGEM_ASSINATURA = 1024 * 1024;

export const AssinaturaSchema = registry.register(
  "Assinatura",
  z
    .object({
      id: z.uuid(),
      userId: z
        .string()
        .nullable()
        .openapi({ description: "Pessoa que assinou (nulo nas assinaturas anteriores ao vínculo)" }),
      nome: z.string().openapi({ description: "Nome de quem assinou, como estava no cadastro na data" }),
      papel: z.enum(PAPEIS_ASSINANTE),
      assinadoEm: z.string().openapi({ description: "Data-hora da assinatura (ISO 8601)" }),
      registradoPorNome: z
        .string()
        .nullable()
        .openapi({ description: "Usuário do painel que colheu a assinatura" }),
    })
    .openapi({
      description:
        "Assinatura eletrônica simples (traço desenhado na tela) — a imagem sai por GET .../assinatura/imagem",
    }),
);

export const AssinanteSchema = registry.register(
  "Assinante",
  z
    .object({
      userId: z.string(),
      nome: z.string(),
      vinculo: z
        .enum(["presidente", "contato", "outro", "proprietario"])
        .openapi({ description: "Função de contato na associação, ou proprietário da propriedade" }),
    })
    .openapi({ description: "Pessoa cadastrada que pode assinar o alvo" }),
);

/** Campos de texto do multipart (a imagem PNG vai no campo "imagem"). */
export const AssinaturaFormSchema = z.object({
  userId: z.string().trim().min(1, "Escolha quem assina"),
  papel: z.enum(PAPEIS_ASSINANTE, { error: "Escolha o papel de quem assina" }),
});

/**
 * Registra no OpenAPI as 4 rotas de assinatura sob `base` (ex.: "/visitas/{id}").
 * Cada módulo dono do alvo monta as rotas e aplica as próprias regras.
 */
export function registrarRotasAssinatura(base: string, tags: string[], params: z.ZodObject, regra: string) {
  const REGRA = { 422: erro(regra) };
  registry.registerPath({
    method: "get",
    path: `${base}/assinatura`,
    tags,
    security: SEGURANCA,
    summary: "Assinatura registrada (data null se ainda não assinado)",
    request: { params },
    responses: { 200: ok(AssinaturaSchema.nullable()), ...ERROS_LEITURA, ...REGRA },
  });
  registry.registerPath({
    method: "post",
    path: `${base}/assinatura`,
    tags,
    security: SEGURANCA,
    summary: "Registrar a assinatura (multipart: imagem PNG até 1 MB + userId de quem assina + papel)",
    request: {
      params,
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              imagem: z.string().openapi({ type: "string", format: "binary" }),
              userId: z.string().openapi({ description: "Um dos GET .../assinatura/assinantes" }),
              papel: z.enum(PAPEIS_ASSINANTE),
            }),
          },
        },
      },
    },
    responses: {
      201: criado(AssinaturaSchema),
      ...ERROS_ESCRITA,
      ...ERROS.conflito,
      ...REGRA,
      413: erro("Imagem muito grande"),
      415: erro("A imagem precisa ser PNG"),
      502: erro("Falha ao enviar ao storage"),
    },
  });
  registry.registerPath({
    method: "get",
    path: `${base}/assinatura/assinantes`,
    tags,
    security: SEGURANCA,
    summary: "Quem pode assinar: contatos da associação ou o produtor da propriedade",
    request: { params },
    responses: { 200: okLista(AssinanteSchema), ...ERROS_LEITURA, ...REGRA },
  });
  registry.registerPath({
    method: "get",
    path: `${base}/assinatura/imagem`,
    tags,
    security: SEGURANCA,
    summary: "Imagem da assinatura (PNG, proxy autenticado — o bucket é privado)",
    request: { params },
    responses: {
      200: {
        description: "PNG",
        content: { "image/png": { schema: z.string().openapi({ format: "binary" }) } },
      },
      ...ERROS_LEITURA,
    },
  });
  registry.registerPath({
    method: "delete",
    path: `${base}/assinatura`,
    tags,
    security: SEGURANCA,
    summary: "Remover a assinatura (para corrigir e colher de novo; fica no histórico)",
    request: { params },
    responses: { 204: semConteudo(), ...ERROS_LEITURA },
  });
}
