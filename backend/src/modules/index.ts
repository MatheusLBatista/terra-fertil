import type { Hono } from "hono";
import type { AppEnv } from "../lib/hono.ts";
import estadosRoutes from "./estados/estados.routes.ts";
import municipiosRoutes from "./municipios/municipios.routes.ts";
import historicoRoutes from "./historico/historico.routes.ts";
import papeisRoutes from "./papeis/papeis.routes.ts";
import pessoasRoutes from "./pessoas/pessoas.routes.ts";
import projetosRoutes from "./projetos/projetos.routes.ts";
import associacoesRoutes from "./associacoes/associacoes.routes.ts";
import tiposDocumentoRoutes from "./tipos-documento/tiposDocumento.routes.ts";
import opcoesDiagnosticoRoutes from "./opcoes-diagnostico/opcoesDiagnostico.routes.ts";
import itensRoutes from "./itens/itens.routes.ts";
import produtoresRoutes from "./produtores/produtores.routes.ts";
import propriedadesRoutes from "./propriedades/propriedades.routes.ts";
import eventosRoutes from "./eventos/eventos.routes.ts";
import producoesRoutes from "./producoes/producoes.routes.ts";
import analisesSoloRoutes from "./analises-solo/analisesSolo.routes.ts";
import pedidosCompraRoutes from "./pedidos-compra/pedidosCompra.routes.ts";
import entregasRoutes from "./entregas/entregas.routes.ts";
import metasRoutes from "./metas/metas.routes.ts";
import lancamentosRoutes from "./lancamentos/lancamentos.routes.ts";

// Schemas — importados por efeito colateral para popular o registry OpenAPI
import "./estados/estados.schema.ts";
import "./municipios/municipios.schema.ts";
import "./historico/historico.schema.ts";
import "./papeis/papeis.schema.ts";
import "./pessoas/pessoas.schema.ts";
import "./projetos/projetos.schema.ts";
import "./associacoes/associacoes.schema.ts";
import "./tipos-documento/tiposDocumento.schema.ts";
import "./opcoes-diagnostico/opcoesDiagnostico.schema.ts";
import "./itens/itens.schema.ts";
import "./produtores/produtores.schema.ts";
import "./propriedades/propriedades.schema.ts";
import "./eventos/eventos.schema.ts";
import "./producoes/producoes.schema.ts";
import "./analises-solo/analisesSolo.schema.ts";
import "./pedidos-compra/pedidosCompra.schema.ts";
import "./entregas/entregas.schema.ts";
import "./metas/metas.schema.ts";
import "./lancamentos/lancamentos.schema.ts";

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
  { path: "/tipos-documento", routes: tiposDocumentoRoutes },
  { path: "/opcoes-diagnostico", routes: opcoesDiagnosticoRoutes },
  { path: "/itens", routes: itensRoutes },
  { path: "/produtores", routes: produtoresRoutes },
  { path: "/propriedades", routes: propriedadesRoutes },
  { path: "/eventos", routes: eventosRoutes },
  { path: "/producoes", routes: producoesRoutes },
  { path: "/analises-solo", routes: analisesSoloRoutes },
  { path: "/pedidos-compra", routes: pedidosCompraRoutes },
  { path: "/entregas", routes: entregasRoutes },
  { path: "/metas", routes: metasRoutes },
  { path: "/lancamentos", routes: lancamentosRoutes },
];
