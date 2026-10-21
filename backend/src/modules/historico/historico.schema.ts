import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  SEGURANCA,
  filtroTexto,
  okLista,
  okPagina,
  paginacaoQuery,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const HistoricoAlteracaoSchema = registry.register(
  "HistoricoAlteracao",
  z
    .object({
      id: z.number().int(),
      tabela: z.string(),
      registroId: z.string().nullable().openapi({
        description:
          'PK do registro (composta: valores unidos por ":"); null se a tabela não tem PK nem `id`',
      }),
      operacao: z.enum(["INSERT", "UPDATE", "DELETE"]),
      dadosAnteriores: z.record(z.string(), z.unknown()).nullable(),
      dadosNovos: z.record(z.string(), z.unknown()).nullable(),
      alteradoPor: z.string().nullable(),
      alteradoEm: z.string(),
    })
    .openapi({ description: "Linha do histórico de alterações (populado pela trigger do PostgreSQL)" }),
);

export const ListHistoricoQuerySchema = z.object({
  tabela: filtroTexto("Nome da tabela (igualdade)"),
  registroId: filtroTexto('PK do registro (igualdade; composta: valores unidos por ":")'),
  operacao: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  alteradoPor: filtroTexto("Id do usuário autor (igualdade)"),
  ...paginacaoQuery,
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

registry.registerPath({
  method: "get",
  path: "/historico",
  tags: ["Auditoria"],
  security: SEGURANCA,
  summary: "Consultar o histórico de alterações",
  request: { query: ListHistoricoQuerySchema },
  responses: {
    200: okPagina(HistoricoAlteracaoSchema, "Histórico paginado"),
    ...ERROS.validacao,
    ...ERROS.autenticado,
  },
});

registry.registerPath({
  method: "get",
  path: "/historico/tabelas",
  tags: ["Auditoria"],
  security: SEGURANCA,
  summary: "Listar as tabelas com registros no histórico",
  responses: { 200: okLista(z.string()), ...ERROS.autenticado },
});
