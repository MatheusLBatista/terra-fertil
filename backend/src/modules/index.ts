import type { Hono } from "hono";
import type { AppEnv } from "../lib/hono.ts";
import estadosRoutes from "./estados/estados.routes.ts";
import municipiosRoutes from "./municipios/municipios.routes.ts";
import historicoRoutes from "./historico/historico.routes.ts";
import papeisRoutes from "./papeis/papeis.routes.ts";
import pessoasRoutes from "./pessoas/pessoas.routes.ts";
import projetosRoutes from "./projetos/projetos.routes.ts";
import associacoesRoutes from "./associacoes/associacoes.routes.ts";

// Schemas — importados por efeito colateral para popular o registry OpenAPI
import "./estados/estados.schema.ts";
import "./municipios/municipios.schema.ts";
import "./historico/historico.schema.ts";
import "./papeis/papeis.schema.ts";
import "./pessoas/pessoas.schema.ts";
import "./projetos/projetos.schema.ts";
import "./associacoes/associacoes.schema.ts";

/**
 * Registro dos módulos da API — o ÚNICO lugar a editar ao criar um módulo:
 *   1. importe o `<x>.routes.ts` e adicione `{ path: "/<x>", routes }` abaixo;
 *   2. importe o `<x>.schema.ts` (efeito colateral → documentação em /docs).
 * `src/routes/index.ts` monta tudo daqui; o app.ts não precisa mudar.
 */
export const MODULOS: { path: string; routes: Hono<AppEnv> }[] = [
  { path: "/estados", routes: estadosRoutes },
  { path: "/municipios", routes: municipiosRoutes },
  { path: "/historico", routes: historicoRoutes },
  { path: "/papeis", routes: papeisRoutes },
  { path: "/pessoas", routes: pessoasRoutes },
  { path: "/projetos", routes: projetosRoutes },
  { path: "/associacoes", routes: associacoesRoutes },
];
