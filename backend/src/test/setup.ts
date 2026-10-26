import { afterAll, beforeAll } from "vitest";
import { pool } from "../db/index.ts";

/**
 * setupFiles do projeto `integration`: roda no worker, antes de CADA arquivo
 * `*.integration.test.ts` (o `env` do vitest.config.ts já apontou
 * `DATABASE_URL` para o banco de teste quando este módulo é importado).
 *
 * Regra de higiene dos dados (documentada na skill testes-integracao):
 *
 * - Tabelas de DOMÍNIO (as suas entidades) entram em `TABELAS_DOMINIO` e são
 *   TRUNCADAS antes e depois de cada arquivo — cada arquivo começa do zero.
 * - Tabelas de REFERÊNCIA semeadas (papeis, permissoes, user, estados,
 *   municipios) nunca são truncadas: o seed do globalSetup precisa sobreviver.
 *   Registros que um teste cria nelas usam nomes com `PREFIXO_TESTE` e são
 *   removidos (hard delete) aqui — permissoes caem pelo cascade da FK.
 * - `historico_alteracoes` é um log append-only e não é limpo; os testes da
 *   trigger filtram por `registro_id`.
 */
export const TABELAS_DOMINIO: string[] = [
  "projetos",
  "projeto_equipe",
  "associacoes",
  "associacao_contatos",
  "tipos_documento",
  "associacao_documentos",
  "projeto_associacoes",
  "produtores",
  "propriedades",
  "visitas",
  "visita_equipe",
  "visita_anexos",
  "visita_itens_verificados",
  "opcoes_diagnostico",
  "diagnosticos_associacao",
  "diagnosticos_propriedade",
  "diagnostico_opcoes",
  "recomendacoes",
  "analises_solo",
  "itens",
  "pedidos_compra",
  "entregas",
  "eventos",
  "evento_participantes",
  "metas",
  "indicadores",
  "etapas_indicador",
  "lancamentos_financeiros",
  "producoes",
  "producao_autores",
];

export const PREFIXO_TESTE = "teste-";

export async function limparDadosDeTeste() {
  if (TABELAS_DOMINIO.length > 0) {
    const lista = TABELAS_DOMINIO.map((t) => `"${t}"`).join(", ");
    await pool.query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
  }
  await pool.query("DELETE FROM papeis WHERE nome LIKE $1", [`${PREFIXO_TESTE}%`]);
  // Pessoas criadas pelos testes (e-mail ou nome com o prefixo) — sessões/contas caem pelo cascade
  await pool.query(`DELETE FROM "user" WHERE email LIKE $1 OR name LIKE $1`, [`${PREFIXO_TESTE}%`]);
}

beforeAll(async () => {
  await limparDadosDeTeste();
});

afterAll(async () => {
  await limparDadosDeTeste();
  await pool.end();
});
