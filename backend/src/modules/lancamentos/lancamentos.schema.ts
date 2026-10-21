import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  ERROS_LEITURA,
  ERROS_ESCRITA,
  SEGURANCA,
  erro,
  ok,
  criado,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_LANCAMENTOS = ["data", "valorCentavos", "createdAt"] as const;
export const TIPOS_LANCAMENTO = ["liberacao", "despesa"] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });

export const LancamentoSchema = registry.register(
  "LancamentoFinanceiro",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      metaId: z.uuid().nullable(),
      metaNumero: z.number().int().nullable().openapi({ description: "Número da meta (rubrica), se houver" }),
      tipo: z.enum(TIPOS_LANCAMENTO),
      descricao: z.string(),
      valorCentavos: z.number().int(),
      data: z.string(),
      documentoRef: z.string().nullable(),
      createdAt: z.iso.datetime(),
    })
    .openapi({ description: "Liberação ou despesa do projeto (Meta 9 = Σ despesa ÷ Σ liberação)" }),
);

export const LancamentoIdParamSchema = z.object({ id: z.uuid() });

const MENSAGEM_PERIODO = { message: "A data final não pode ser antes da inicial", path: ["ate"] };

export const ListLancamentosQuerySchema = z
  .object({
    projetoId: z.uuid().optional(),
    tipo: z.enum(TIPOS_LANCAMENTO).optional(),
    metaId: z.uuid().optional(),
    de: data().optional().openapi({ description: "Data inicial (inclusive)" }),
    ate: data().optional().openapi({ description: "Data final (inclusive)" }),
    busca: filtroTexto("Descrição ou documento (contém)"),
    ...paginacaoQuery,
    sort: sortSchema(SORT_LANCAMENTOS),
  })
  .refine((v) => !v.de || !v.ate || v.ate >= v.de, MENSAGEM_PERIODO);

const camposLancamento = {
  metaId: z.uuid().nullable().optional().openapi({ description: "Meta (rubrica) do mesmo projeto" }),
  tipo: z.enum(TIPOS_LANCAMENTO),
  descricao: z.string().trim().min(1, "Informe a descrição").max(500),
  valorCentavos: z
    .number()
    .int("Valor em centavos (inteiro)")
    .positive("O valor deve ser maior que zero")
    .max(Number.MAX_SAFE_INTEGER)
    .openapi({ description: "Valor em centavos" }),
  data: data(),
  documentoRef: z.string().trim().max(200).nullable().optional().openapi({ description: "NF, empenho, OB…" }),
};

export const CreateLancamentoSchema = z.object({ projetoId: z.uuid(), ...camposLancamento });
export const UpdateLancamentoSchema = z.object(camposLancamento).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Lançamentos financeiros"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const META_DE_OUTRO_PROJETO = { 422: erro("A meta informada não é deste projeto") };

registry.registerPath({
  method: "get",
  path: "/lancamentos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar lançamentos (só os dos projetos do escopo) com os totais do filtro",
  request: { query: ListLancamentosQuerySchema },
  responses: {
    200: {
      description:
        "Lista paginada; `meta.totais` soma liberações e despesas de TODO o filtro (não só da página)",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(LancamentoSchema),
            meta: z.object({
              total: z.number().int(),
              limit: z.number().int(),
              offset: z.number().int(),
              totais: z.object({
                liberadoCentavos: z.number().int(),
                despesaCentavos: z.number().int(),
              }),
            }),
            erros: z.array(z.string()),
          }),
        },
      },
    },
    ...ERROS.validacao,
    ...ERROS_LEITURA,
  },
});

registry.registerPath({
  method: "get",
  path: "/lancamentos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um lançamento",
  request: { params: LancamentoIdParamSchema },
  responses: { 200: ok(LancamentoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/lancamentos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar liberação ou despesa",
  request: { body: corpo(CreateLancamentoSchema) },
  responses: {
    201: criado(LancamentoSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    ...META_DE_OUTRO_PROJETO,
  },
});

registry.registerPath({
  method: "patch",
  path: "/lancamentos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar lançamento",
  request: { params: LancamentoIdParamSchema, body: corpo(UpdateLancamentoSchema) },
  responses: { 200: ok(LancamentoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...META_DE_OUTRO_PROJETO },
});

registry.registerPath({
  method: "delete",
  path: "/lancamentos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir lançamento",
  request: { params: LancamentoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
