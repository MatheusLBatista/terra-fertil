// Barrel do schema Drizzle — é o `schema` apontado pelo drizzle.config.ts.
// Todo model novo PRECISA ser re-exportado aqui para entrar nas migrations.

// ─── Better Auth ─────────────────────────────────────────────────────────────
export * from "./user.ts";
export * from "./account.ts";
export * from "./session.ts";
export * from "./verification.ts";

// ─── Enums ───────────────────────────────────────────────────────────────────
export * from "./enums.ts";

// ─── Auditoria ───────────────────────────────────────────────────────────────
export * from "./historicoAlteracao.ts";

// ─── Autorização (RBAC) ──────────────────────────────────────────────────────
export * from "./papel.ts";
export * from "./permissao.ts";

// ─── Localização (IBGE) ──────────────────────────────────────────────────────
export * from "./estado.ts";
export * from "./municipio.ts";

// ─── Domínio ─────────────────────────────────────────────────────────────────

// Projetos
export * from "./projeto.ts";
export * from "./projetoEquipe.ts";

// Associações
export * from "./associacao.ts";
export * from "./associacaoContato.ts";
export * from "./tipoDocumento.ts";
export * from "./associacaoDocumento.ts";
export * from "./projetoAssociacao.ts";

// Produtores e propriedades
export * from "./produtor.ts";
export * from "./propriedade.ts";

// Visitas e diagnósticos
export * from "./visita.ts";
export * from "./visitaEquipe.ts";
export * from "./visitaAnexo.ts";
export * from "./opcaoDiagnostico.ts";
export * from "./diagnosticoAssociacao.ts";
export * from "./diagnosticoPropriedade.ts";
export * from "./diagnosticoOpcao.ts";
export * from "./recomendacao.ts";

// Solo
export * from "./analiseSolo.ts";

// Equipamentos
export * from "./item.ts";
export * from "./pedidoCompra.ts";
export * from "./entrega.ts";
