import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  ERROS_LEITURA,
  ERROS_ESCRITA,
  SEGURANCA,
  ok,
  okLista,
  okPagina,
  criado,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";
import { MENSAGEM_PESSOA, PessoaRefSchema, refinarPessoa } from "../pessoas/pessoas.schema.ts";

extendZodWithOpenApi(z);

export const SORT_PROJETOS = ["sigla", "nome", "inicio", "fim", "createdAt"] as const;
export const SORT_ADESOES = ["sigla", "aderiuEm", "createdAt"] as const;

export const SITUACOES_PROJETO = ["planejado", "em_execucao", "encerrado"] as const;
export const TIPOS_EQUIPE = ["coordenador", "tecnico", "estudante", "administrativo"] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });
const centavos = () => z.number().int().min(0).openapi({ description: "Valor em centavos" });

export const ProjetoSchema = registry.register(
  "Projeto",
  z
    .object({
      id: z.uuid(),
      sigla: z.string(),
      nome: z.string(),
      numeroInstrumento: z.string().nullable(),
      concedente: z.string().nullable(),
      executor: z.string().nullable(),
      inicio: z.string(),
      fim: z.string(),
      valorTotalCentavos: z.number().int(),
      situacao: z.enum(SITUACOES_PROJETO),
    })
    .openapi({ description: "Projeto/convênio — dono das metas e dos registros operacionais" }),
);

export const ProjetoIdParamSchema = z.object({ id: z.uuid() });

export const ListProjetosQuerySchema = z.object({
  busca: filtroTexto("Sigla ou nome (contém)"),
  situacao: z.enum(SITUACOES_PROJETO).optional(),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PROJETOS),
});

const camposProjeto = {
  sigla: z.string().trim().min(1, "Informe a sigla").max(30),
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  numeroInstrumento: z.string().trim().max(60).nullable().optional(),
  concedente: z.string().trim().max(200).nullable().optional(),
  executor: z.string().trim().max(200).nullable().optional(),
  inicio: data(),
  fim: data(),
  valorTotalCentavos: centavos().optional(),
  situacao: z.enum(SITUACOES_PROJETO).optional(),
};

const periodoValido = (v: { inicio?: string; fim?: string }) => !v.inicio || !v.fim || v.fim >= v.inicio;
const MENSAGEM_PERIODO = { message: "O fim não pode ser antes do início", path: ["fim"] };

export const CreateProjetoSchema = z.object(camposProjeto).refine(periodoValido, MENSAGEM_PERIODO);

export const UpdateProjetoSchema = z
  .object({ ...camposProjeto, inicio: data().optional(), fim: data().optional() })
  .partial()
  .refine(periodoValido, MENSAGEM_PERIODO);

// ─── Equipe ──────────────────────────────────────────────────────────────────

export const MembroEquipeSchema = registry.register(
  "MembroEquipe",
  z.object({
    id: z.uuid(),
    projetoId: z.uuid(),
    userId: z.string(),
    nome: z.string(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
    tipo: z.enum(TIPOS_EQUIPE),
    funcao: z.string().nullable(),
    instituicao: z.string().nullable(),
    curso: z.string().nullable(),
    contratadoEm: z.string().nullable(),
    desligadoEm: z.string().nullable(),
  }),
);

export const MembroIdParamSchema = z.object({ id: z.uuid(), membroId: z.uuid() });

const camposMembro = {
  tipo: z.enum(TIPOS_EQUIPE),
  funcao: z.string().trim().max(200).nullable().optional(),
  instituicao: z.string().trim().max(200).nullable().optional(),
  curso: z.string().trim().max(200).nullable().optional(),
  contratadoEm: data().nullable().optional(),
  desligadoEm: data().nullable().optional(),
};

const periodoEquipeValido = (v: { contratadoEm?: string | null; desligadoEm?: string | null }) =>
  !v.contratadoEm || !v.desligadoEm || v.desligadoEm >= v.contratadoEm;
const MENSAGEM_PERIODO_EQUIPE = {
  message: "O desligamento não pode ser antes da contratação",
  path: ["desligadoEm"],
};

export const CreateMembroSchema = z
  .object({ ...PessoaRefSchema, ...camposMembro })
  .refine(refinarPessoa, { message: MENSAGEM_PESSOA, path: ["userId"] })
  .refine(periodoEquipeValido, MENSAGEM_PERIODO_EQUIPE);

export const UpdateMembroSchema = z
  .object(camposMembro)
  .partial()
  .refine(periodoEquipeValido, MENSAGEM_PERIODO_EQUIPE);

// ─── Adesões de associações ──────────────────────────────────────────────────

export const AdesaoSchema = registry.register(
  "AdesaoAssociacao",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      associacaoId: z.uuid(),
      sigla: z.string(),
      nome: z.string().nullable(),
      municipio: z.string(),
      aderiuEm: z.string().nullable(),
      interesseDeclarado: z.boolean().nullable(),
      demandaInicial: z.string().nullable(),
      valorSugeridoCentavos: z.number().int().nullable(),
      parceriaFormalizadaEm: z.string().nullable(),
      ativo: z.boolean(),
    })
    .openapi({ description: "Participação de uma associação no projeto" }),
);

export const AdesaoIdParamSchema = z.object({ id: z.uuid(), adesaoId: z.uuid() });

export const ListAdesoesQuerySchema = z.object({
  busca: filtroTexto("Sigla ou nome da associação (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_ADESOES),
});

const camposAdesao = {
  aderiuEm: data().nullable().optional(),
  interesseDeclarado: z.boolean().nullable().optional(),
  demandaInicial: z.string().trim().max(2000).nullable().optional(),
  valorSugeridoCentavos: centavos().nullable().optional(),
  parceriaFormalizadaEm: data().nullable().optional(),
  ativo: z.boolean().optional(),
};

export const CreateAdesaoSchema = z.object({ associacaoId: z.uuid(), ...camposAdesao });
export const UpdateAdesaoSchema = z.object(camposAdesao);

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Projetos"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/projetos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar projetos (só os do escopo do usuário)",
  request: { query: ListProjetosQuerySchema },
  responses: { 200: okPagina(ProjetoSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/projetos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um projeto",
  request: { params: ProjetoIdParamSchema },
  responses: { 200: ok(ProjetoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/projetos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar projeto",
  request: { body: corpo(CreateProjetoSchema) },
  responses: { 201: criado(ProjetoSchema), ...ERROS.validacao, ...ERROS.autenticado, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/projetos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar projeto",
  request: { params: ProjetoIdParamSchema, body: corpo(UpdateProjetoSchema) },
  responses: { 200: ok(ProjetoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/projetos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir projeto (bloqueado se já tiver metas, equipe, adesões ou registros)",
  request: { params: ProjetoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/projetos/{id}/equipe",
  tags: TAG,
  security: SEGURANCA,
  summary: "Equipe do projeto",
  request: { params: ProjetoIdParamSchema },
  responses: { 200: okLista(MembroEquipeSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/projetos/{id}/equipe",
  tags: TAG,
  security: SEGURANCA,
  summary: "Incluir pessoa na equipe (existente por userId ou nova por pessoa) — passa a ver o projeto",
  request: { params: ProjetoIdParamSchema, body: corpo(CreateMembroSchema) },
  responses: { 201: criado(MembroEquipeSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/projetos/{id}/equipe/{membroId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar a atuação de um membro da equipe",
  request: { params: MembroIdParamSchema, body: corpo(UpdateMembroSchema) },
  responses: { 200: ok(MembroEquipeSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/projetos/{id}/equipe/{membroId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Retirar da equipe (a pessoa deixa de ver o projeto)",
  request: { params: MembroIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/projetos/{id}/associacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Associações que aderiram ao projeto",
  request: { params: ProjetoIdParamSchema, query: ListAdesoesQuerySchema },
  responses: { 200: okPagina(AdesaoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/projetos/{id}/associacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar a adesão de uma associação ao projeto",
  request: { params: ProjetoIdParamSchema, body: corpo(CreateAdesaoSchema) },
  responses: { 201: criado(AdesaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/projetos/{id}/associacoes/{adesaoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar a adesão (interesse, demanda inicial, parceria da Meta 2)",
  request: { params: AdesaoIdParamSchema, body: corpo(UpdateAdesaoSchema) },
  responses: { 200: ok(AdesaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/projetos/{id}/associacoes/{adesaoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Desfazer a adesão",
  request: { params: AdesaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
