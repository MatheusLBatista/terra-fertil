import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.ts";

extendZodWithOpenApi(z);

/**
 * Blocos reutilizáveis para registrar paths no OpenAPI.
 *
 * O objetivo é que o envelope `{ data, meta, erros }` seja descrito de um jeito
 * só — inclusive nas respostas de erro, que ficam com o formato visível para
 * quem lê a documentação ou gera cliente a partir do spec.
 */

// ─── Erro ─────────────────────────────────────────────────────────────────────

export const ErroSchema = registry.register(
  "Erro",
  z
    .object({
      data: z.array(z.unknown()).openapi({ description: "Sempre vazio em respostas de erro" }),
      meta: z
        .object({
          campos: z
            .record(z.string(), z.string())
            .optional()
            .openapi({ description: "Validação (400): mensagem por campo" }),
          codigo: z
            .string()
            .optional()
            .openapi({ description: "Código estável do erro de negócio, quando houver" }),
        })
        .openapi({ description: "Vazio, exceto `campos` (400) e `codigo` (AppError.codigo)" }),
      erros: z.array(z.string()).openapi({ description: "Mensagens de erro" }),
    })
    .openapi({
      description: "Resposta de erro — mesmo envelope das respostas de sucesso",
      example: { data: [], meta: {}, erros: ["Fornecedor não encontrado"] },
      examples: [
        { data: [], meta: {}, erros: ["Fornecedor não encontrado"] },
        { data: [], meta: { campos: { nome: "Obrigatório" } }, erros: ["nome: Obrigatório"] },
      ],
    }),
);

/** Resposta de erro com corpo tipado. */
export const erro = (description: string) => ({
  description,
  content: { "application/json": { schema: ErroSchema } },
});

/**
 * Respostas de erro comuns. Espalhe o que a rota realmente pode devolver:
 * `responses: { 200: ..., ...ERROS.autenticado, ...ERROS.naoEncontrado }`.
 */
export const ERROS = {
  validacao: { 400: erro("Dados inválidos") },
  autenticado: { 401: erro("Não autenticado"), 403: erro("Sem permissão para esta ação") },
  naoEncontrado: { 404: erro("Registro não encontrado") },
  conflito: {
    409: erro("Conflito — registro já existe, é referenciado por outro ou viola uma regra de negócio"),
  },
  valorInvalido: { 422: erro("Valor rejeitado por uma restrição do banco (check)") },
  regraNegocio: { 400: erro("Operação não permitida pelas regras de negócio") },
} as const;

/** Security scheme único da API (registrado no app.ts): a sessão do better-auth em cookie httpOnly. */
export const SEGURANCA = [{ sessionCookie: [] }];

/** Conjunto usado pela maioria das rotas autenticadas de escrita. */
export const ERROS_ESCRITA = {
  ...ERROS.validacao,
  ...ERROS.autenticado,
  ...ERROS.naoEncontrado,
};

/** Conjunto usado pela maioria das rotas autenticadas de leitura. */
export const ERROS_LEITURA = {
  ...ERROS.autenticado,
  ...ERROS.naoEncontrado,
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const MetaPaginacaoSchema = registry.register(
  "MetaPaginacao",
  z
    .object({
      total: z
        .number()
        .int()
        .openapi({ description: "Total de registros que atendem ao filtro (ignora a paginação)" }),
      limit: z.number().int().openapi({ description: "Tamanho da página aplicado" }),
      offset: z.number().int().openapi({ description: "Deslocamento aplicado" }),
    })
    .openapi({ description: "Metadados de paginação", example: { total: 42, limit: 10, offset: 0 } }),
);

/** `meta` livre — para respostas que não paginam. */
const metaLivre = z.record(z.string(), z.unknown());

// ─── Envelopes de sucesso ─────────────────────────────────────────────────────

/** `{ data: T, meta: {...}, erros: [] }` — recurso único. */
export const respostaItem = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: schema, meta: metaLivre, erros: z.array(z.string()) });

/** `{ data: T[], meta: {...}, erros: [] }` — coleção sem paginação. */
export const respostaLista = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: z.array(schema), meta: metaLivre, erros: z.array(z.string()) });

/** `{ data: T[], meta: { total, limit, offset }, erros: [] }` — coleção paginada. */
export const respostaPaginada = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: z.array(schema), meta: MetaPaginacaoSchema, erros: z.array(z.string()) });

// ─── Atalhos para `responses` ─────────────────────────────────────────────────

const json = (schema: z.ZodTypeAny, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const ok = <T extends z.ZodTypeAny>(schema: T, d = "Sucesso") => json(respostaItem(schema), d);
export const okLista = <T extends z.ZodTypeAny>(schema: T, d = "Lista") => json(respostaLista(schema), d);
export const okPagina = <T extends z.ZodTypeAny>(schema: T, d = "Lista paginada") =>
  json(respostaPaginada(schema), d);
export const criado = <T extends z.ZodTypeAny>(schema: T, d = "Criado") => json(respostaItem(schema), d);
export const semConteudo = (d = "Removido com sucesso") => ({ description: d });

// ─── Paginação e ordenação (query) ────────────────────────────────────────────

/**
 * Base das querystrings de listagem: `limit`/`offset` + `sort` (`campo:asc|desc`).
 * A allowlist de colunas ordenáveis é declarada por módulo com `sortSchema` —
 * nunca aceite nome de coluna arbitrário (vira injeção de SQL via ORDER BY).
 */
export const paginacaoQuery = {
  limit: z.coerce.number().int().min(1).max(200).default(10),
  offset: z.coerce.number().int().min(0).default(0),
};

/**
 * Filtro de texto da querystring (`?nome=...`): apara espaços e trata vazio como
 * ausente — `?nome=` ou `?nome=%20%20` não filtram nada (nem viram 400). O
 * repository só aplica o filtro quando o valor é truthy.
 */
export const filtroTexto = (description?: string) =>
  z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .optional()
    .openapi(description ? { description } : {});

export type SortDir = "asc" | "desc";
export type Sort<C extends string> = { campo: C; direcao: SortDir };

/** `sort=nome:desc` → `{ campo: "nome", direcao: "desc" }`, validado contra a allowlist. */
export const sortSchema = <C extends readonly [string, ...string[]]>(colunas: C) =>
  z
    .string()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, "Formato esperado: campo:asc|desc")
    .transform((v) => {
      const [campo, direcao] = v.split(":");
      return { campo, direcao } as Sort<C[number]>;
    })
    .refine((v) => (colunas as readonly string[]).includes(v.campo), {
      message: `Campo de ordenação inválido. Use um de: ${colunas.join(", ")}`,
    })
    .optional()
    .openapi({ description: `Ordenação no formato campo:asc|desc. Campos: ${colunas.join(", ")}` });
