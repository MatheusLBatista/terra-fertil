import { bodyLimit } from "hono/body-limit";
import type { AppContext } from "../../lib/hono.ts";
import { errorResponse } from "../../lib/response.ts";
import { respostaValidacao } from "../../lib/zod.ts";
import { lerArquivo } from "../../lib/storage/upload.ts";
import { AssinaturaFormSchema, MAX_IMAGEM_ASSINATURA } from "./assinaturas.schema.ts";

/** Limite do corpo nas rotas POST .../assinatura (imagem + campos de texto). */
export const limiteAssinatura = bodyLimit({
  maxSize: MAX_IMAGEM_ASSINATURA + 16 * 1024,
  onError: (c) => c.json(errorResponse("Imagem da assinatura muito grande. Tamanho máximo: 1 MB"), 413),
});

/** Lê o multipart da assinatura: imagem PNG (campo "imagem") + userId de quem assina + papel. */
export async function lerFormAssinatura(c: AppContext) {
  const imagem = await lerArquivo(c, {
    campo: "imagem",
    tipos: ["image/png"],
    maxBytes: MAX_IMAGEM_ASSINATURA,
    mensagemTipo: "A imagem da assinatura precisa ser PNG",
  });
  // O Hono guarda o corpo já lido: os campos de texto saem do mesmo parse
  const campos = await c.req.parseBody();
  const form = AssinaturaFormSchema.safeParse({
    userId: typeof campos.userId === "string" ? campos.userId : undefined,
    papel: typeof campos.papel === "string" ? campos.papel : undefined,
  });
  if (!form.success) return { erro: respostaValidacao(c, form.error.issues) } as const;
  return { imagem, dados: form.data };
}
