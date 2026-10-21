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
import { cnpjValido, somenteDigitos } from "../../lib/documentos.ts";
import { MENSAGEM_PESSOA, PessoaRefSchema, refinarPessoa } from "../pessoas/pessoas.schema.ts";

extendZodWithOpenApi(z);

export const SORT_ASSOCIACOES = ["sigla", "nome", "municipio", "numProdutores", "createdAt"] as const;

export const FUNCOES_CONTATO = ["presidente", "contato", "outro"] as const;
export const SITUACOES_DOCUMENTO = ["pendente", "recebido", "validado", "rejeitado"] as const;
export const RESPOSTAS_DIAGNOSTICO = ["sim", "nao", "parcialmente", "nao_sei"] as const;
export const GRUPOS_OPCAO = [
  "atividade_produtiva",
  "problema_solo",
  "tema_capacitacao",
  "parceiro_institucional",
  "apoio_necessario",
] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });
const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const inteiroNaoNegativo = () => z.number().int().min(0).nullable().optional();

// ─── Associação ──────────────────────────────────────────────────────────────

export const AssociacaoSchema = registry.register(
  "Associacao",
  z
    .object({
      id: z.uuid(),
      sigla: z.string(),
      nome: z.string().nullable(),
      cnpj: z.string().nullable().openapi({ description: "Só dígitos" }),
      municipioId: z.number().int(),
      municipioNome: z.string(),
      uf: z.string(),
      distrito: z.string().nullable(),
      endereco: z.string().nullable(),
      numProdutores: z.number().int().nullable(),
      numFamilias: z.number().int().nullable(),
      areaMediaHa: z.number().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      mapaUrl: z.string().nullable(),
      grupoWhatsappUrl: z.string().nullable(),
      dadosRevisados: z.boolean(),
      ativo: z.boolean(),
    })
    .openapi({ description: "Associação/cooperativa — cadastro compartilhado entre projetos" }),
);

export const AssociacaoIdParamSchema = z.object({ id: z.uuid() });

export const ListAssociacoesQuerySchema = z.object({
  busca: filtroTexto("Sigla, nome ou CNPJ (contém)"),
  municipioId: z.coerce.number().int().optional(),
  projetoId: z.uuid().optional().openapi({ description: "Só as que aderiram a este projeto" }),
  ativo: z.stringbool().optional(),
  ...paginacaoQuery,
  sort: sortSchema(SORT_ASSOCIACOES),
});

const cnpjSchema = z
  .string()
  .trim()
  .transform(somenteDigitos)
  .refine(cnpjValido, "CNPJ inválido")
  .openapi({ example: "07.638.987/0001-13" });

const camposAssociacao = {
  sigla: z.string().trim().min(1, "Informe a sigla").max(60),
  nome: texto(300),
  cnpj: cnpjSchema.nullable().optional(),
  municipioId: z.number().int(),
  distrito: texto(120),
  endereco: texto(300),
  numProdutores: inteiroNaoNegativo(),
  numFamilias: inteiroNaoNegativo(),
  areaMediaHa: z.number().min(0).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  mapaUrl: z.url("Link inválido").nullable().optional(),
  grupoWhatsappUrl: z.url("Link inválido").nullable().optional(),
  dadosRevisados: z.boolean().optional(),
  ativo: z.boolean().optional(),
};

const coordenadasJuntas = (v: { latitude?: number | null; longitude?: number | null }) =>
  v.latitude === undefined && v.longitude === undefined
    ? true
    : ((v.latitude ?? null) === null) === ((v.longitude ?? null) === null);
const MENSAGEM_COORDENADAS = { message: "Informe latitude e longitude juntas", path: ["longitude"] };

export const CreateAssociacaoSchema = z
  .object({
    ...camposAssociacao,
    projetoId: z
      .uuid()
      .optional()
      .openapi({ description: "Registra a adesão ao projeto junto (obrigatório para quem não vê todos)" }),
  })
  .refine(coordenadasJuntas, MENSAGEM_COORDENADAS);

export const UpdateAssociacaoSchema = z
  .object({
    ...camposAssociacao,
    municipioId: z.number().int().optional(),
    sigla: camposAssociacao.sigla.optional(),
  })
  .refine(coordenadasJuntas, MENSAGEM_COORDENADAS);

// ─── Contatos ────────────────────────────────────────────────────────────────

export const ContatoSchema = registry.register(
  "ContatoAssociacao",
  z.object({
    id: z.uuid(),
    associacaoId: z.uuid(),
    userId: z.string(),
    nome: z.string(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
    funcao: z.enum(FUNCOES_CONTATO),
    principal: z.boolean(),
    desde: z.string().nullable(),
    ate: z.string().nullable(),
  }),
);

export const ContatoIdParamSchema = z.object({ id: z.uuid(), contatoId: z.uuid() });

const camposContato = {
  funcao: z.enum(FUNCOES_CONTATO).optional(),
  principal: z.boolean().optional(),
  desde: data().nullable().optional(),
  ate: data().nullable().optional(),
};

export const CreateContatoSchema = z
  .object({ ...PessoaRefSchema, ...camposContato })
  .refine(refinarPessoa, { message: MENSAGEM_PESSOA, path: ["userId"] });

export const UpdateContatoSchema = z.object(camposContato);

// ─── Documentos ──────────────────────────────────────────────────────────────

export const DocumentoSchema = registry.register(
  "DocumentoAssociacao",
  z.object({
    id: z.uuid(),
    associacaoId: z.uuid(),
    tipoDocumentoId: z.uuid(),
    tipoDocumento: z.string(),
    projetoId: z.uuid().nullable(),
    projetoSigla: z.string().nullable(),
    situacao: z.enum(SITUACOES_DOCUMENTO),
    temArquivo: z.boolean(),
    nomeArquivo: z.string().nullable(),
    mimeType: z.string().nullable(),
    tamanhoBytes: z.number().int().nullable(),
    validade: z.string().nullable(),
    observacao: z.string().nullable(),
  }),
);

export const DocumentoIdParamSchema = z.object({ id: z.uuid(), documentoId: z.uuid() });

const camposDocumento = {
  situacao: z.enum(SITUACOES_DOCUMENTO).optional(),
  validade: data().nullable().optional(),
  observacao: texto(2000),
};

export const CreateDocumentoSchema = z.object({
  tipoDocumentoId: z.uuid(),
  projetoId: z
    .uuid()
    .nullable()
    .optional()
    .openapi({ description: "Só para tipos de documento por projeto" }),
  ...camposDocumento,
});

export const UpdateDocumentoSchema = z.object(camposDocumento);

// ─── Diagnóstico ─────────────────────────────────────────────────────────────

export const OpcaoMarcadaSchema = registry.register(
  "OpcaoMarcada",
  z.object({
    opcaoId: z.uuid(),
    grupo: z.enum(GRUPOS_OPCAO),
    nome: z.string(),
    detalhe: z.string().nullable(),
  }),
);

const camposDiagnostico = {
  analiseSoloRecente: z.enum(RESPOSTAS_DIAGNOSTICO).nullable().optional(),
  acessoMaquinario: z.enum(RESPOSTAS_DIAGNOSTICO).nullable().optional(),
  praticasConservacao: texto(2000),
  participouCursos: z.enum(RESPOSTAS_DIAGNOSTICO).nullable().optional(),
  interesseCapacitacao: z.boolean().nullable().optional(),
  possuiRegistroFormal: z.boolean().nullable().optional(),
  possuiLocalEventos: z.boolean().nullable().optional(),
  tipoLocalEventos: texto(300),
  potencialNaoExplorado: texto(2000),
  comentarios: texto(4000),
  revisado: z.boolean().optional(),
};

export const DiagnosticoAssociacaoSchema = registry.register(
  "DiagnosticoAssociacao",
  z
    .object({
      associacaoId: z.uuid(),
      visitaId: z.uuid().nullable(),
      coletadoEm: z.string(),
      analiseSoloRecente: z.enum(RESPOSTAS_DIAGNOSTICO).nullable(),
      acessoMaquinario: z.enum(RESPOSTAS_DIAGNOSTICO).nullable(),
      praticasConservacao: z.string().nullable(),
      participouCursos: z.enum(RESPOSTAS_DIAGNOSTICO).nullable(),
      interesseCapacitacao: z.boolean().nullable(),
      possuiRegistroFormal: z.boolean().nullable(),
      possuiLocalEventos: z.boolean().nullable(),
      tipoLocalEventos: z.string().nullable(),
      potencialNaoExplorado: z.string().nullable(),
      comentarios: z.string().nullable(),
      revisado: z.boolean(),
      opcoes: z.array(OpcaoMarcadaSchema),
    })
    .openapi({ description: "Diagnóstico único da associação, reaproveitado por todos os projetos" }),
);

export const PutDiagnosticoSchema = z.object({
  visitaId: z.uuid().nullable().optional().openapi({ description: "Visita inicial em que foi coletado" }),
  coletadoEm: data(),
  ...camposDiagnostico,
  opcoes: z
    .array(z.object({ opcaoId: z.uuid(), detalhe: z.string().trim().max(500).nullable().optional() }))
    .default([])
    .openapi({ description: "Substitui o conjunto de opções marcadas" }),
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Associações"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/associacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar associações (quem não vê todos os projetos só vê as que aderiram aos seus)",
  request: { query: ListAssociacoesQuerySchema },
  responses: { 200: okPagina(AssociacaoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/associacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma associação",
  request: { params: AssociacaoIdParamSchema },
  responses: { 200: ok(AssociacaoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/associacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Cadastrar associação (com projetoId, já registra a adesão ao projeto)",
  request: { body: corpo(CreateAssociacaoSchema) },
  responses: { 201: criado(AssociacaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/associacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar associação",
  request: { params: AssociacaoIdParamSchema, body: corpo(UpdateAssociacaoSchema) },
  responses: { 200: ok(AssociacaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/associacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir associação (bloqueado se tiver propriedades ou participar de projetos)",
  request: { params: AssociacaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/associacoes/{id}/contatos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Contatos da associação (presidente, contato principal…)",
  request: { params: AssociacaoIdParamSchema },
  responses: { 200: okLista(ContatoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/associacoes/{id}/contatos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Incluir contato (pessoa existente por userId ou nova por pessoa)",
  request: { params: AssociacaoIdParamSchema, body: corpo(CreateContatoSchema) },
  responses: { 201: criado(ContatoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/associacoes/{id}/contatos/{contatoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar função/período do contato (marcar como principal desmarca o anterior)",
  request: { params: ContatoIdParamSchema, body: corpo(UpdateContatoSchema) },
  responses: { 200: ok(ContatoSchema), ...ERROS_ESCRITA },
});

registry.registerPath({
  method: "delete",
  path: "/associacoes/{id}/contatos/{contatoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Remover o vínculo do contato com a associação (a pessoa continua cadastrada)",
  request: { params: ContatoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/associacoes/{id}/documentos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Documentos da associação (os por projeto só dos projetos visíveis)",
  request: { params: AssociacaoIdParamSchema },
  responses: { 200: okLista(DocumentoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/associacoes/{id}/documentos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar documento (o arquivo vai depois, em PUT …/arquivo)",
  request: { params: AssociacaoIdParamSchema, body: corpo(CreateDocumentoSchema) },
  responses: {
    201: criado(DocumentoSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    422: ERROS.valorInvalido[422],
  },
});

registry.registerPath({
  method: "patch",
  path: "/associacoes/{id}/documentos/{documentoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar situação, validade ou observação do documento",
  request: { params: DocumentoIdParamSchema, body: corpo(UpdateDocumentoSchema) },
  responses: { 200: ok(DocumentoSchema), ...ERROS_ESCRITA },
});

registry.registerPath({
  method: "delete",
  path: "/associacoes/{id}/documentos/{documentoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir documento",
  request: { params: DocumentoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "put",
  path: "/associacoes/{id}/documentos/{documentoId}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Enviar/substituir o arquivo do documento (multipart, campo `arquivo`, PDF ou imagem)",
  request: {
    params: DocumentoIdParamSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ arquivo: z.string().openapi({ type: "string", format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    200: ok(DocumentoSchema),
    ...ERROS_ESCRITA,
    413: { description: "Arquivo muito grande" },
    415: { description: "Tipo de arquivo não permitido" },
  },
});

registry.registerPath({
  method: "get",
  path: "/associacoes/{id}/documentos/{documentoId}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Baixar o arquivo do documento (proxy autenticado)",
  request: { params: DocumentoIdParamSchema },
  responses: { 200: { description: "Conteúdo do arquivo" }, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/associacoes/{id}/diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Diagnóstico da associação (404 se ainda não preenchido)",
  request: { params: AssociacaoIdParamSchema },
  responses: { 200: ok(DiagnosticoAssociacaoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "put",
  path: "/associacoes/{id}/diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Preencher/atualizar o diagnóstico (substitui as opções marcadas; versões antigas no histórico)",
  request: { params: AssociacaoIdParamSchema, body: corpo(PutDiagnosticoSchema) },
  responses: { 200: ok(DiagnosticoAssociacaoSchema), ...ERROS_ESCRITA, 422: ERROS.valorInvalido[422] },
});
