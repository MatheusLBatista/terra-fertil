import ts from "typescript";
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

/**
 * Análise estática do template:
 *
 * 1. BACK — percorre route → controller → service → repository de cada módulo
 *    em src/modules (funções executadas, parâmetros, schemas, operações Drizzle);
 * 2. FRONT — percorre cada tela do painel (frontend/app/xx/page.tsx), segue os
 *    imports locais e extrai as chamadas `fetchData(url, método)` — cruzando
 *    "qual tela usa qual rota".
 *
 * Gera o relatório HTML na raiz (relatorio.html) com um diagrama mermaid
 * por rota. Uso: npm run relatorio:rotas
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..");
const ROOT = resolve(SRC, "../..");
const MODULES_DIR = join(SRC, "modules");
const FRONTEND = join(ROOT, "frontend");
const OUT = join(ROOT, "relatorio.html");

// ─── Helpers de AST ──────────────────────────────────────────────────────────

function parseFile(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Texto compacto de um nó (colapsa espaços/quebras de linha). */
function compact(node: ts.Node, max = 60): string {
  const text = node.getText().replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ─── Modelo extraído (back) ──────────────────────────────────────────────────

interface CallInfo {
  method: string;
  args: string[];
}

interface FnInfo {
  name: string;
  params: string[];
  safeParses: { schema: string; input: string }[];
  serviceCalls: CallInfo[];
  repoCalls: CallInfo[];
  appErrors: string[];
  statusCodes: number[];
  responses: string[];
  dbOps: string[];
  tables: string[];
  transaction: boolean;
}

interface RouteInfo {
  httpMethod: string;
  path: string;
  fullPath: string;
  middlewares: string[];
  handler: string;
  summary?: string;
}

interface SchemaField {
  nome: string;
  def: string;
}

interface ModuleInfo {
  name: string;
  basePath: string;
  routes: RouteInfo[];
  controller: Record<string, FnInfo>;
  service: Record<string, FnInfo>;
  repository: Record<string, FnInfo>;
  classNames: { controller?: string; service?: string; repository?: string };
  /** Campos dos schemas zod do módulo (nome do schema → campos). */
  schemas: Record<string, SchemaField[]>;
}

// ─── Extração por arquivo (back) ─────────────────────────────────────────────

const DB_CHAIN_OPS = new Set([
  "select",
  "selectDistinct",
  "insert",
  "update",
  "delete",
  "from",
  "values",
  "set",
  "where",
  "orderBy",
  "limit",
  "offset",
  "leftJoin",
  "innerJoin",
  "groupBy",
  "returning",
  "onConflictDoNothing",
  "onConflictDoUpdate",
]);
const TABLE_OPS = new Set(["from", "insert", "update", "delete", "leftJoin", "innerJoin"]);

function analyzeBody(body: ts.Node): Omit<FnInfo, "name" | "params"> {
  const info: Omit<FnInfo, "name" | "params"> = {
    safeParses: [],
    serviceCalls: [],
    repoCalls: [],
    appErrors: [],
    statusCodes: [],
    responses: [],
    dbOps: [],
    tables: [],
    transaction: false,
  };

  walk(body, (n) => {
    if (ts.isNewExpression(n) && n.expression.getText() === "AppError") {
      info.appErrors.push((n.arguments ?? []).map((a) => compact(a, 50)).join(", "));
      return;
    }
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression;
    const calleeText = callee.getText().replace(/\s+/g, "");
    const args = n.arguments.map((a) => compact(a, 48));

    if (calleeText.endsWith(".safeParse") || calleeText.endsWith(".parse")) {
      const schema = calleeText.replace(/\.(safeParse|parse)$/, "");
      if (!info.safeParses.some((s) => s.schema === schema)) {
        info.safeParses.push({ schema, input: args[0] ?? "" });
      }
    } else if (calleeText.startsWith("this.service.")) {
      info.serviceCalls.push({ method: calleeText.slice("this.service.".length), args });
    } else if (calleeText.startsWith("this.repository.")) {
      info.repoCalls.push({ method: calleeText.slice("this.repository.".length), args });
    } else if (calleeText === "c.json" || calleeText === "c.body") {
      // status explícito no 2º argumento: c.json(envelope, 201) / c.body(null, 204)
      const code = Number(n.arguments[1]?.getText());
      if (!Number.isNaN(code)) info.statusCodes.push(code);
    } else if (calleeText === "successResponse" || calleeText === "errorResponse") {
      info.responses.push(`${calleeText}(${args.join(", ")})`);
    } else if (calleeText.endsWith(".transaction")) {
      info.transaction = true;
    } else if (ts.isPropertyAccessExpression(callee)) {
      const op = callee.name.text;
      if (DB_CHAIN_OPS.has(op)) {
        const rootText = callee.expression.getText();
        if (/\b(db|tx)\b/.test(rootText) || op === "where" || op === "orderBy") {
          if (!info.dbOps.includes(op)) info.dbOps.push(op);
          if (TABLE_OPS.has(op)) {
            const table = n.arguments[0]?.getText();
            if (table && /^[A-Za-z_$][\w$]*$/.test(table) && !info.tables.includes(table)) {
              info.tables.push(table);
            }
          }
        }
      }
    }
  });

  // O walk visita a cadeia do Drizzle de fora para dentro (offset → ... → select);
  // inverte para a ordem de leitura natural.
  info.dbOps.reverse();
  return info;
}

function analyzeClassFile(path: string): { className?: string; fns: Record<string, FnInfo> } {
  const fns: Record<string, FnInfo> = {};
  if (!existsSync(path)) return { fns };
  const sf = parseFile(path);
  let className: string | undefined;

  walk(sf, (n) => {
    if (!ts.isClassDeclaration(n)) return;
    className = n.name?.text;
    for (const member of n.members) {
      let name: string | undefined;
      let fnNode: ts.Node | undefined;
      let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

      if (ts.isMethodDeclaration(member) && member.body) {
        name = member.name.getText();
        fnNode = member.body;
        params = member.parameters;
      } else if (
        ts.isPropertyDeclaration(member) &&
        member.initializer &&
        (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
      ) {
        name = member.name.getText();
        fnNode = member.initializer.body;
        params = member.initializer.parameters;
      }

      if (name && fnNode && params) {
        fns[name] = {
          name,
          params: params.map((p) => compact(p, 70)),
          ...analyzeBody(fnNode),
        };
      }
    }
  });

  return { className, fns };
}

function analyzeRoutesFile(path: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  if (!existsSync(path)) return routes;
  const sf = parseFile(path);

  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
    const receiver = n.expression.expression.getText();
    const method = n.expression.name.text;
    if (receiver !== "router" || !["get", "post", "put", "patch", "delete", "all"].includes(method)) return;

    const [first, ...rest] = n.arguments;
    if (!first || !ts.isStringLiteral(first)) return;

    const middlewares: string[] = [];
    let handler = "";
    for (const arg of rest) {
      const text = compact(arg, 70);
      if (ts.isPropertyAccessExpression(arg) && arg.expression.getText() === "controller") {
        handler = arg.name.text;
      } else {
        middlewares.push(text);
      }
    }
    routes.push({ httpMethod: method.toUpperCase(), path: first.text, fullPath: "", middlewares, handler });
  });

  return routes;
}

function analyzeSchemaFile(path: string): Map<string, string> {
  const summaries = new Map<string, string>();
  if (!existsSync(path)) return summaries;
  const sf = parseFile(path);

  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || n.expression.getText() !== "registry.registerPath") return;
    const arg = n.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    let method = "",
      routePath = "",
      summary = "";
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = prop.name.getText();
      if (ts.isStringLiteral(prop.initializer)) {
        if (key === "method") method = prop.initializer.text.toUpperCase();
        if (key === "path") routePath = prop.initializer.text;
        if (key === "summary") summary = prop.initializer.text;
      }
    }
    if (method && routePath) summaries.set(`${method} ${routePath}`, summary);
  });

  return summaries;
}

/**
 * Campos dos schemas zod do módulo: para cada `export const XSchema = ...`,
 * extrai as propriedades do primeiro `z.object({...})` (ou `.extend({...})`).
 * Spreads (`...paginacaoQuery`) aparecem como campo compartilhado.
 */
function analyzeSchemaFields(path: string): Record<string, SchemaField[]> {
  const schemas: Record<string, SchemaField[]> = {};
  if (!existsSync(path)) return schemas;
  const sf = parseFile(path);

  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
    if (!n.name.text.endsWith("Schema")) return;

    let objeto: ts.ObjectLiteralExpression | undefined;
    walk(n.initializer, (inner) => {
      if (objeto || !ts.isCallExpression(inner)) return;
      const callee = inner.expression.getText();
      if (
        (callee === "z.object" || callee.endsWith(".extend")) &&
        inner.arguments[0] &&
        ts.isObjectLiteralExpression(inner.arguments[0])
      ) {
        objeto = inner.arguments[0];
      }
    });
    if (!objeto) return;

    const campos: SchemaField[] = [];
    for (const prop of objeto.properties) {
      if (ts.isPropertyAssignment(prop)) {
        campos.push({ nome: prop.name.getText(), def: compact(prop.initializer, 80) });
      } else if (ts.isSpreadAssignment(prop)) {
        campos.push({
          nome: `…${compact(prop.expression, 40)}`,
          def: "campos compartilhados (src/lib/openapi/helpers.ts)",
        });
      }
    }
    if (campos.length > 0) schemas[n.name.text] = campos;
  });

  return schemas;
}

// ─── Permissões: seed de papéis × requirePermission das rotas ────────────────

interface PapelSeed {
  nome: string;
  permissoes: { acao: string; subject: string }[];
}

function analyzeSeedsPapeis(): PapelSeed[] {
  const path = join(SRC, "seeds", "papeis.ts");
  if (!existsSync(path)) return [];
  const sf = parseFile(path);
  const papeis: PapelSeed[] = [];

  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || n.name.getText() !== "PAPEIS_DEMO" || !n.initializer) return;
    walk(n.initializer, (item) => {
      if (!ts.isObjectLiteralExpression(item)) return;
      let nome = "";
      const permissoes: { acao: string; subject: string }[] = [];
      for (const prop of item.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (prop.name.getText() === "nome" && ts.isStringLiteral(prop.initializer))
          nome = prop.initializer.text;
        if (prop.name.getText() === "permissoes") {
          walk(prop.initializer, (perm) => {
            if (!ts.isObjectLiteralExpression(perm)) return;
            const par: Record<string, string> = {};
            for (const p of perm.properties) {
              if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) {
                par[p.name.getText()] = p.initializer.text;
              }
            }
            if (par.acao && par.subject) permissoes.push({ acao: par.acao, subject: par.subject });
          });
        }
      }
      if (nome) papeis.push({ nome, permissoes });
    });
  });

  return papeis;
}

/** `requirePermission("read", "Papel")` no texto dos middlewares da rota. */
function permissaoDaRota(route: RouteInfo): { acao: string; subject: string } | null {
  for (const mw of route.middlewares) {
    const m = mw.match(/requirePermission\(\s*"(\w+)"\s*,\s*"(\w+)"\s*\)/);
    if (m) return { acao: m[1], subject: m[2] };
  }
  return null;
}

function papelPodeAcessar(papel: PapelSeed, perm: { acao: string; subject: string }): boolean {
  return papel.permissoes.some(
    (p) =>
      (p.acao === "manage" || p.acao === perm.acao) && (p.subject === "all" || p.subject === perm.subject),
  );
}

function analyzeMounts(): Map<string, string> {
  const mounts = new Map<string, string>();
  // Os módulos são registrados em src/modules/index.ts: `{ path: "/x", routes: xRoutes }`
  const sf = parseFile(join(MODULES_DIR, "index.ts"));
  const importDirs = new Map<string, string>();

  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && n.importClause?.name && ts.isStringLiteral(n.moduleSpecifier)) {
      const m = n.moduleSpecifier.text.match(/^\.\/([^/]+)\//);
      if (m) importDirs.set(n.importClause.name.text, m[1]);
    }
    if (ts.isObjectLiteralExpression(n)) {
      let path: string | undefined;
      let routes: string | undefined;
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
        if (p.name.text === "path" && ts.isStringLiteral(p.initializer)) path = p.initializer.text;
        if (p.name.text === "routes" && ts.isIdentifier(p.initializer)) routes = p.initializer.text;
      }
      const dir = routes ? importDirs.get(routes) : undefined;
      if (path && dir) mounts.set(dir, path);
    }
    if (
      ts.isCallExpression(n) &&
      ["router.route", "router.use", "app.route"].includes(n.expression.getText()) &&
      n.arguments.length === 2 &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      const dir = importDirs.get(n.arguments[1].getText());
      if (dir) mounts.set(dir, n.arguments[0].text);
    }
  });

  return mounts;
}

function buildModel(): ModuleInfo[] {
  const mounts = analyzeMounts();
  const dirs = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => [...mounts.keys()].indexOf(a) - [...mounts.keys()].indexOf(b));

  return dirs.map((name) => {
    const base = join(MODULES_DIR, name, name);
    const routes = analyzeRoutesFile(`${base}.routes.ts`);
    const summaries = analyzeSchemaFile(`${base}.schema.ts`);
    const controller = analyzeClassFile(`${base}.controller.ts`);
    const service = analyzeClassFile(`${base}.service.ts`);
    const repository = analyzeClassFile(`${base}.repository.ts`);
    const schemas = analyzeSchemaFields(`${base}.schema.ts`);
    const basePath = mounts.get(name) ?? `/${name}`;

    for (const r of routes) {
      r.fullPath = basePath + (r.path === "/" ? "" : r.path) || "/";
      r.summary = summaries.get(`${r.httpMethod} ${r.fullPath}`);
    }

    return {
      name,
      basePath,
      routes,
      schemas,
      controller: controller.fns,
      service: service.fns,
      repository: repository.fns,
      classNames: {
        controller: controller.className,
        service: service.className,
        repository: repository.className,
      },
    };
  });
}

// ─── Análise do FRONT: telas × rotas ─────────────────────────────────────────

interface FrontCall {
  method: string;
  path: string;
  /** Eventos que disparam a chamada (IFML): "carregamento" (useQuery) ou o nome
   *  da mutation/função (ex.: "salvar", "excluirMutation"). */
  contextos: string[];
}
interface TelaInfo {
  tela: string;
  arquivo: string;
  chamadas: FrontCall[];
  usaAuthClient: boolean;
}

/** `/papeis/${id}/permissoes` → `/papeis/:param/permissoes`; corta a querystring. */
function normalizeFrontUrl(node: ts.Expression): string | null {
  let raw: string | null = null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) raw = node.text;
  else if (ts.isTemplateExpression(node)) {
    raw = node.head.text + node.templateSpans.map((s) => ":param" + s.literal.text).join("");
  }
  if (!raw || !raw.startsWith("/")) return null;
  return raw.split("?")[0].replace(/\/$/, "") || "/";
}

interface FrontFileInfo {
  imports: string[];
  calls: FrontCall[];
  usaAuthClient: boolean;
}
const frontFileCache = new Map<string, FrontFileInfo>();

/**
 * Evento que dispara a chamada (IFML: Event → Action): sobe a árvore — dentro
 * de `queryFn` é o carregamento da tela; dentro de `mutationFn` é a ação com o
 * nome da variável (`const salvar = useMutation(...)` → "salvar"); senão, o
 * nome da função/hook que envolve a chamada.
 */
function contextoDaChamada(n: ts.Node): string {
  let tipo: "query" | "mutation" | "" = "";
  let nome = "";
  let cur: ts.Node | undefined = n.parent;
  while (cur) {
    if (ts.isPropertyAssignment(cur)) {
      const chave = cur.name.getText();
      if (chave === "queryFn") tipo = "query";
      if (chave === "mutationFn") tipo = "mutation";
    }
    if (!nome && ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) nome = cur.name.text;
    if (!nome && ts.isFunctionDeclaration(cur) && cur.name) nome = cur.name.text;
    cur = cur.parent;
  }
  if (tipo === "query") return "carregamento";
  if (tipo === "mutation") return `ação ${nome || "mutation"}`;
  return nome || "chamada direta";
}

function analyzeFrontFile(path: string): FrontFileInfo {
  const cached = frontFileCache.get(path);
  if (cached) return cached;

  const info: FrontFileInfo = { imports: [], calls: [], usaAuthClient: false };
  const source = readFileSync(path, "utf8");
  info.usaAuthClient = /\bauthClient\./.test(source);
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      info.imports.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.getText() === "fetchData" && n.arguments[0]) {
      const url = normalizeFrontUrl(n.arguments[0]);
      if (!url) return;
      const metArg = n.arguments[1];
      const method = metArg && ts.isStringLiteral(metArg) ? metArg.text.toUpperCase() : "GET";
      info.calls.push({ method, path: url, contextos: [contextoDaChamada(n)] });
    }
  });

  frontFileCache.set(path, info);
  return info;
}

function resolveFrontImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(FRONTEND, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function listarPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listarPages(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

/** frontend/app/(auth)/papeis/page.tsx → "/papeis" (route groups são descartados). */
function telaDaPage(pagePath: string): string {
  const rel = relative(join(FRONTEND, "app"), dirname(pagePath));
  const segs = rel.split("/").filter((s) => s && !s.startsWith("("));
  return "/" + segs.join("/");
}

function analyzeFrontend(): TelaInfo[] {
  const appDir = join(FRONTEND, "app");
  if (!existsSync(appDir)) return [];

  return listarPages(appDir)
    .map((page) => {
      // BFS no grafo de imports locais da tela (hooks, components, libs)
      const fila = [page];
      const vistos = new Set<string>();
      const chamadas: FrontCall[] = [];
      let usaAuthClient = false;

      while (fila.length > 0 && vistos.size < 300) {
        const arquivo = fila.shift()!;
        if (vistos.has(arquivo)) continue;
        vistos.add(arquivo);
        const info = analyzeFrontFile(arquivo);
        if (arquivo === page || !arquivo.includes("/components/ui/")) usaAuthClient ||= info.usaAuthClient;
        chamadas.push(...info.calls);
        for (const spec of info.imports) {
          const alvo = resolveFrontImport(arquivo, spec);
          if (alvo && !vistos.has(alvo)) fila.push(alvo);
        }
      }

      // Dedupe por método+path, somando os contextos (uma rota pode ser chamada
      // no carregamento E por uma ação)
      const unicas = new Map<string, FrontCall>();
      for (const c of chamadas) {
        const chave = `${c.method} ${c.path}`;
        const atual = unicas.get(chave);
        if (atual) atual.contextos = [...new Set([...atual.contextos, ...c.contextos])];
        else unicas.set(chave, { ...c, contextos: [...c.contextos] });
      }
      return {
        tela: telaDaPage(page),
        arquivo: relative(ROOT, page),
        chamadas: [...unicas.values()].sort((a, b) => a.path.localeCompare(b.path)),
        usaAuthClient,
      };
    })
    .sort((a, b) => a.tela.localeCompare(b.tela));
}

/** Casa uma chamada do front com uma rota da API (segmentos; ":x" é coringa). */
function rotaDaChamada(call: FrontCall, mods: ModuleInfo[]): RouteInfo | undefined {
  const segs = call.path.split("/").filter(Boolean);
  for (const mod of mods) {
    for (const route of mod.routes) {
      if (route.httpMethod !== call.method) continue;
      const rsegs = route.fullPath.split("/").filter(Boolean);
      if (rsegs.length !== segs.length) continue;
      const ok = rsegs.every((rs, i) =>
        rs.startsWith(":") ? true : segs[i].startsWith(":") ? false : rs === segs[i],
      );
      if (ok) return route;
    }
  }
  return undefined;
}

// ─── Geração do mermaid ──────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/"/g, "'").replace(/[<>]/g, "");
/** Escapa cada linha e junta com <br/> (o esc não pode comer a própria tag). */
const escBr = (parts: string[]) => parts.map(esc).join("<br/>");
const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CLASS_DEFS = [
  "classDef light fill:#eef0f3,stroke:#a6adb8,stroke-width:1px,color:#1c2333;",
  "classDef dark fill:#141c36,stroke:#141c36,color:#ffffff;",
  "classDef mini fill:#f8f9fb,stroke:#c9cfd8,stroke-width:1px,color:#3c4452,font-size:12px;",
];

/** Diagrama de UMA rota — cadeia compacta e legível (um mermaid por rota). */
function routeDiagram(mod: ModuleInfo, route: RouteInfo): string {
  const lines: string[] = ["flowchart TD"];
  const cls: string[] = [];
  let i = 0;
  const id = () => `n${i++}`;

  const routeId = id();
  lines.push(`${routeId}["${esc(`${route.httpMethod} ${route.fullPath}`)}"]`);
  cls.push(`class ${routeId} light`);

  let prev = routeId;
  for (const mw of route.middlewares) {
    const mwId = id();
    lines.push(`${mwId}["${esc(mw)}"]`);
    cls.push(`class ${mwId} mini`);
    lines.push(`${prev} --> ${mwId}`);
    prev = mwId;
  }

  const ctrl = mod.controller[route.handler];
  const ctrlId = id();
  const ctrlLabel = [`${mod.classNames.controller ?? "Controller"}.${route.handler}`];
  if (ctrl?.safeParses.length) ctrlLabel.push(`valida ${ctrl.safeParses.map((s) => s.schema).join(", ")}`);
  lines.push(`${ctrlId}["${escBr(ctrlLabel)}"]`);
  cls.push(`class ${ctrlId} dark`);
  const reqInput =
    ctrl?.safeParses.map((s) => s.input).join(", ") || (ctrl?.params[0]?.startsWith("_") ? "" : "req");
  lines.push(`${prev} ${reqInput ? `-->|"${esc(reqInput)}"|` : "-->"} ${ctrlId}`);

  for (const sc of ctrl?.serviceCalls ?? []) {
    const svc = mod.service[sc.method];
    const svcId = id();
    lines.push(
      `${svcId}["${esc(`${mod.classNames.service ?? "Service"}.${sc.method}(${(svc?.params ?? []).map((p) => p.split(":")[0]).join(", ")})`)}"]`,
    );
    cls.push(`class ${svcId} dark`);
    lines.push(`${ctrlId} ${sc.args.length ? `-->|"${esc(sc.args.join(", "))}"|` : "-->"} ${svcId}`);

    for (const rc of svc?.repoCalls ?? []) {
      const repo = mod.repository[rc.method];
      const repoId = id();
      const repoLabel = [`${mod.classNames.repository ?? "Repository"}.${rc.method}`];
      if (repo?.dbOps.length) repoLabel.push(repo.dbOps.join(" · "));
      lines.push(`${repoId}["${escBr(repoLabel)}"]`);
      cls.push(`class ${repoId} dark`);
      lines.push(`${svcId} ${rc.args.length ? `-->|"${esc(rc.args.join(", "))}"|` : "-->"} ${repoId}`);

      for (const table of repo?.tables ?? []) {
        const tId = id();
        lines.push(`${tId}["tabela ${esc(table)}"]`);
        cls.push(`class ${tId} light`);
        lines.push(`${repoId} --> ${tId}`);
      }
    }
  }

  return lines.concat(CLASS_DEFS).concat(cls).join("\n");
}

function overviewDiagram(mods: ModuleInfo[]): string {
  const lines = [
    "flowchart TD",
    `app["src/app.ts (Hono)"]`,
    `router["src/routes/index.ts"]`,
    "app --> router",
  ];
  const cls = ["class app light", "class router dark"];
  mods.forEach((m, idx) => {
    const rid = `m${idx}`;
    const total = m.routes.length;
    lines.push(`${rid}["${escBr([m.basePath, `${total} rota${total === 1 ? "" : "s"}`])}"]`);
    cls.push(`class ${rid} dark`);
    lines.push(`router -->|"router.route('${m.basePath}')"| ${rid}`);
  });
  return lines.concat(CLASS_DEFS).concat(cls).join("\n");
}

// ─── Geração do HTML ─────────────────────────────────────────────────────────

function metodoBadge(metodo: string): string {
  return `<span class="method ${metodo.toLowerCase()}">${metodo}</span>`;
}

function fnDetails(layer: string, cls: string | undefined, fn: FnInfo | undefined, call?: CallInfo): string {
  if (!fn) return "";
  const does: string[] = [];
  for (const sp of fn.safeParses)
    does.push(`valida <code>${escHtml(sp.input)}</code> com <code>${escHtml(sp.schema)}</code>`);
  for (const sc of fn.serviceCalls)
    does.push(`chama <code>service.${escHtml(sc.method)}(${escHtml(sc.args.join(", "))})</code>`);
  for (const rc of fn.repoCalls)
    does.push(`chama <code>repository.${escHtml(rc.method)}(${escHtml(rc.args.join(", "))})</code>`);
  if (fn.transaction) does.push("abre <code>db.transaction</code>");
  for (const err of fn.appErrors) does.push(`lança <code>AppError(${escHtml(err)})</code>`);
  if (fn.dbOps.length) does.push(`Drizzle: <code>${escHtml(fn.dbOps.join(" → "))}</code>`);
  if (fn.tables.length) does.push(`tabela(s): <code>${escHtml(fn.tables.join(", "))}</code>`);
  for (const r of fn.responses) does.push(`responde <code>${escHtml(r)}</code>`);
  if (fn.statusCodes.length) does.push(`status: ${fn.statusCodes.map((s) => `<code>${s}</code>`).join(" ")}`);

  return `<tr>
    <td class="layer">${layer}</td>
    <td><code>${escHtml(`${cls ?? ""}.${fn.name}`)}</code></td>
    <td>${fn.params.length ? fn.params.map((p) => `<code>${escHtml(p)}</code>`).join("<br/>") : "<span class='none'>—</span>"}</td>
    <td>${call?.args.length ? call.args.map((a) => `<code>${escHtml(a)}</code>`).join(", ") : "<span class='none'>—</span>"}</td>
    <td>${does.length ? does.join("<br/>") : "<span class='none'>—</span>"}</td>
  </tr>`;
}

/** Bloco expansível com os campos de cada schema validado pela rota. */
function schemaDetails(mod: ModuleInfo, ctrl: FnInfo | undefined): string {
  if (!ctrl?.safeParses.length) return "";
  return ctrl.safeParses
    .map((sp) => {
      const campos = mod.schemas[sp.schema];
      const resumo = `valida <code>${escHtml(sp.input)}</code> com <code>${escHtml(sp.schema)}</code>`;
      if (!campos) return `<p class="schema-linha">${resumo}</p>`;
      const linhas = campos
        .map(
          (c) => `<tr><td><code>${escHtml(c.nome)}</code></td><td><code>${escHtml(c.def)}</code></td></tr>`,
        )
        .join("\n");
      return `<details class="schema">
        <summary>${resumo} <span>(${campos.length} campos)</span></summary>
        <table><thead><tr><th>Campo</th><th>Definição (zod)</th></tr></thead><tbody>${linhas}</tbody></table>
      </details>`;
    })
    .join("\n");
}

function routeCard(mod: ModuleInfo, route: RouteInfo, usadaPor: string[]): string {
  const ctrl = mod.controller[route.handler];
  const rows: string[] = [];

  rows.push(`<tr>
    <td class="layer">route</td>
    <td><code>router.${route.httpMethod.toLowerCase()}("${escHtml(route.path)}")</code></td>
    <td>${route.middlewares.length ? route.middlewares.map((m) => `<code>${escHtml(m)}</code>`).join("<br/>") : "<span class='none'>pública</span>"}</td>
    <td><span class='none'>—</span></td>
    <td>encaminha para <code>controller.${escHtml(route.handler)}</code></td>
  </tr>`);

  rows.push(fnDetails("controller", mod.classNames.controller, ctrl));
  for (const sc of ctrl?.serviceCalls ?? []) {
    const svc = mod.service[sc.method];
    rows.push(fnDetails("service", mod.classNames.service, svc, sc));
    for (const rc of svc?.repoCalls ?? []) {
      rows.push(fnDetails("repository", mod.classNames.repository, mod.repository[rc.method], rc));
    }
  }

  const chips = usadaPor.length
    ? `<p class="usage">Usada pelo painel em ${usadaPor.map((t) => `<a class="chip" href="#telas">${escHtml(t)}</a>`).join(" ")}</p>`
    : `<p class="usage none-usage">Nenhuma tela do painel chama esta rota diretamente</p>`;

  return `<article class="route">
    <div class="route-head">
      <h3>${metodoBadge(route.httpMethod)} <code>${escHtml(route.fullPath)}</code></h3>
      ${route.summary ? `<p class="summary">${escHtml(route.summary)}</p>` : ""}
    </div>
    ${chips}
    <div class="validacao">${schemaDetails(mod, ctrl)}</div>
    <div class="diagram"><pre class="mermaid">${escHtml(routeDiagram(mod, route))}</pre></div>
    <div class="wrap-scroll"><table>
      <thead><tr><th>Camada</th><th>Função</th><th>Assinatura (parâmetros)</th><th>Recebe (call site)</th><th>O que executa</th></tr></thead>
      <tbody>${rows.join("\n")}</tbody>
    </table></div>
  </article>`;
}

/**
 * Diagrama telas → rotas (inspirado no IFML: ViewContainer → Action): as telas
 * do painel à esquerda, as rotas da API que elas disparam à direita.
 */
function telasDiagram(telas: TelaInfo[], mods: ModuleInfo[]): string {
  const lines = ["flowchart LR"];
  const cls: string[] = [];
  const rotaIds = new Map<string, string>();
  let i = 0;

  const comChamadas = telas.filter((t) => t.chamadas.some((c) => rotaDaChamada(c, mods)));
  comChamadas.forEach((t, ti) => {
    const tid = `t${ti}`;
    lines.push(`${tid}["${esc(`tela ${t.tela}`)}"]`);
    cls.push(`class ${tid} light`);
    for (const c of t.chamadas) {
      const rota = rotaDaChamada(c, mods);
      if (!rota) continue;
      const key = `${rota.httpMethod} ${rota.fullPath}`;
      let rid = rotaIds.get(key);
      if (!rid) {
        rid = `r${i++}`;
        rotaIds.set(key, rid);
        lines.push(`${rid}["${esc(key)}"]`);
        cls.push(`class ${rid} dark`);
      }
      // Aresta com o EVENTO que dispara (IFML) — ações nomeadas; carregamento fica sem rótulo
      const acoes = c.contextos.filter((ctx) => ctx !== "carregamento");
      lines.push(`${tid} ${acoes.length ? `-->|"${esc(acoes.join(", "))}"|` : "-->"} ${rid}`);
    }
  });

  return lines.concat(CLASS_DEFS).concat(cls).join("\n");
}

function telasSection(telas: TelaInfo[], mods: ModuleInfo[]): string {
  if (telas.length === 0) return "";

  const linhas = telas.map((t) => {
    const chips = t.chamadas.map((c) => {
      const rota = rotaDaChamada(c, mods);
      const alvo = rota ? `#rota-${rota.httpMethod}-${rota.fullPath.replace(/[^a-z0-9]/gi, "_")}` : null;
      const eventos = c.contextos.length
        ? `<span class="evt">${escHtml(c.contextos.join(" · "))}</span>`
        : "";
      const conteudo = `${metodoBadge(c.method)}<code>${escHtml(c.path)}</code>${eventos}`;
      return alvo
        ? `<a class="chip" href="${alvo}">${conteudo}</a>`
        : `<span class="chip off" title="Fora do inventário de módulos (ex.: better-auth)">${conteudo}</span>`;
    });
    if (t.usaAuthClient) {
      chips.push(
        `<span class="chip auth" title="Fala com o better-auth via authClient">authClient · /auth/*</span>`,
      );
    }
    return `<tr>
      <td class="tela"><code>${escHtml(t.tela)}</code><br/><span class="arquivo">${escHtml(t.arquivo)}</span></td>
      <td><div class="chips">${chips.join(" ") || "<span class='none'>nenhuma chamada à API</span>"}</div></td>
    </tr>`;
  });

  return `
  <section class="card" id="telas">
    <p class="label">PAINEL — QUAIS TELAS USAM QUAIS ROTAS</p>
    <p class="hint">Extraído do código do <code>frontend/</code>: cada <code>page.tsx</code> e os módulos
    que ela importa (hooks, components) são varridos atrás de <code>fetchData(url, método)</code>.
    Clique numa rota para ir ao fluxo dela.</p>
    <div class="diagram" style="border-top:0"><pre class="mermaid">${escHtml(telasDiagram(telas, mods))}</pre></div>
    <div class="wrap-scroll"><table class="telas">
      <thead><tr><th>Tela</th><th>Rotas da API usadas</th></tr></thead>
      <tbody>${linhas.join("\n")}</tbody>
    </table></div>
  </section>`;
}

/** Matriz papel × rota: cruza o requirePermission de cada rota com o seed. */
function permissoesSection(mods: ModuleInfo[], papeis: PapelSeed[]): string {
  if (papeis.length === 0) return "";

  const linhas: string[] = [];
  for (const mod of mods) {
    for (const route of mod.routes) {
      const perm = permissaoDaRota(route);
      const publica = route.middlewares.length === 0;
      const celulas = papeis.map((p) => {
        if (publica) return `<td class="ok" title="Rota pública">✓</td>`;
        if (!perm) return `<td class="ok" title="Autenticada sem requirePermission">✓*</td>`;
        return papelPodeAcessar(p, perm) ? `<td class="ok">✓</td>` : `<td class="no">—</td>`;
      });
      const regra = publica
        ? `<span class="chip off">pública</span>`
        : perm
          ? `<code>${escHtml(`${perm.acao} ${perm.subject}`)}</code>`
          : `<span class="chip off">só autenticação</span>`;
      linhas.push(`<tr>
        <td>${metodoBadge(route.httpMethod)} <code>${escHtml(route.fullPath)}</code></td>
        <td>${regra}</td>
        ${celulas.join("")}
      </tr>`);
    }
  }

  return `
  <section class="card" id="permissoes">
    <p class="label">AUTORIZAÇÃO — QUEM PODE CHAMAR O QUÊ</p>
    <p class="hint">Cruzamento do <code>requirePermission(acao, subject)</code> de cada rota com as
    permissões do seed (<code>src/seeds/papeis.ts</code>) — em produção as permissões vivem no banco
    e podem divergir do seed. Papéis criados em runtime não aparecem aqui.</p>
    <div class="wrap-scroll"><table class="matriz">
      <thead><tr><th>Rota</th><th>Permissão exigida</th>${papeis.map((p) => `<th class="papel">${escHtml(p.nome)}</th>`).join("")}</tr></thead>
      <tbody>${linhas.join("\n")}</tbody>
    </table></div>
  </section>`;
}

function html(mods: ModuleInfo[], telas: TelaInfo[], papeis: PapelSeed[]): string {
  const generatedAt = new Date().toLocaleString("pt-BR");
  const totalRotas = mods.reduce((acc, m) => acc + m.routes.length, 0);

  // rota → telas que a usam
  const usoPorRota = new Map<string, Set<string>>();
  for (const t of telas) {
    for (const c of t.chamadas) {
      const rota = rotaDaChamada(c, mods);
      if (!rota) continue;
      const key = `${rota.httpMethod} ${rota.fullPath}`;
      if (!usoPorRota.has(key)) usoPorRota.set(key, new Set());
      usoPorRota.get(key)!.add(t.tela);
    }
  }

  const sections = mods
    .map(
      (mod) => `
  <section class="card" id="mod-${escHtml(mod.name)}">
    <div class="mod-head">
      <p class="label">MÓDULO — ${escHtml(mod.name.toUpperCase())}</p>
      <h2><code>${escHtml(mod.basePath)}</code><span>${mod.routes.length} rota${mod.routes.length === 1 ? "" : "s"}</span></h2>
    </div>
    ${mod.routes
      .map((r) => {
        const key = `${r.httpMethod} ${r.fullPath}`;
        const card = routeCard(mod, r, [...(usoPorRota.get(key) ?? [])].sort());
        // âncora estável para os links da seção de telas
        return `<div id="rota-${r.httpMethod}-${r.fullPath.replace(/[^a-z0-9]/gi, "_")}">${card}</div>`;
      })
      .join("\n")}
  </section>`,
    )
    .join("\n");

  const tocModulos = mods
    .map(
      (m) =>
        `<a href="#mod-${escHtml(m.name)}"><code>${escHtml(m.basePath)}</code><span>${m.routes.length}</span></a>`,
    )
    .join("");
  const tocTelas = telas.length ? `<a href="#telas">telas × rotas<span>${telas.length}</span></a>` : "";
  const tocPermissoes = papeis.length
    ? `<a href="#permissoes">permissões<span>${papeis.length} papéis</span></a>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Relatório de rotas — template-ia</title>
<style>
  :root {
    --ink: #171c28; --muted: #667085; --line: #e2e6eb; --navy: #141c36;
    --bg: #f2f3f6; --card: #ffffff; --soft: #f7f8fa;
    --get: #1a5fb4; --post: #1e6e46; --putpatch: #8a6210; --del: #8a2a2a;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 72px; }
  body { margin: 0; background: var(--bg); color: var(--ink); overflow-x: clip;
         font: 15px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  code { font: 12.5px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
         background: #eef1f4; border-radius: 5px; padding: 1px 5px; }

  /* Barra fixa de navegação */
  .topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 16px;
            padding: 10px 24px; background: rgba(255,255,255,.92); backdrop-filter: blur(8px);
            border-bottom: 1px solid var(--line); }
  .topbar strong { font-size: 14px; white-space: nowrap; }
  .topbar nav { display: flex; gap: 6px; overflow-x: auto; }
  .topbar a { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px;
              border: 1px solid var(--line); border-radius: 999px; text-decoration: none;
              color: var(--ink); background: var(--soft); font-size: 12.5px; white-space: nowrap; }
  .topbar a:hover { border-color: #b6bec9; background: #fff; }
  .topbar a span { color: var(--muted); font-size: 11px; }
  .topbar a code { background: transparent; padding: 0; }

  /* Largura total — sem faixa lateral. min-width:0 nos filhos do grid deixa os
     containers internos (diagramas/tabelas) rolarem sem alargar a página. */
  main { width: 100%; padding: 24px 24px 96px; display: grid; gap: 28px; }
  main > * { min-width: 0; }

  /* Hero */
  .hero { background: linear-gradient(135deg, var(--navy) 0%, #24304f 100%); color: #fff;
          border-radius: 18px; padding: 40px 44px; }
  .hero .overline { font-size: 12px; letter-spacing: .22em; color: #9aa7c7; margin: 0 0 10px; }
  .hero h1 { margin: 0 0 10px; font-size: 30px; letter-spacing: -.01em; }
  .hero p { margin: 0; max-width: 760px; color: #c3cbdd; font-size: 14px; }
  .hero code { background: rgba(255,255,255,.12); color: #e8ecf5; }
  .hero .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
  .hero .stats span { border: 1px solid rgba(255,255,255,.22); border-radius: 999px;
                      padding: 5px 14px; font-size: 12.5px; color: #dfe5f0; }

  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px;
          padding: 28px 32px; box-shadow: 0 1px 3px rgba(16,24,40,.05); }
  .label { color: #8a93a3; font-size: 12px; font-weight: 700; letter-spacing: .18em; margin: 0; }
  .hint { color: var(--muted); font-size: 13.5px; margin: 6px 0 14px; }

  .mod-head { margin-bottom: 4px; }
  .mod-head h2 { display: flex; align-items: baseline; gap: 12px; margin: 6px 0 0; font-size: 21px; }
  .mod-head h2 code { font-size: 18px; background: var(--soft); border: 1px solid var(--line); }
  .mod-head h2 span { color: var(--muted); font-size: 13.5px; font-weight: 400; }

  .route { border: 1px solid var(--line); border-radius: 14px; margin-top: 18px;
           background: #fdfdfe; overflow: hidden; }
  .route-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px;
                padding: 16px 22px 0; }
  .route h3 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 10px; }
  .route h3 code { font-size: 14px; background: transparent; padding: 0; font-weight: 600; }
  .summary { margin: 0; color: var(--muted); font-size: 13.5px; }
  .usage { margin: 8px 22px 0; font-size: 12.5px; color: var(--muted); }
  .none-usage { opacity: .75; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2.5px 10px;
          border: 1px solid var(--line); border-radius: 999px; background: #fff;
          font-size: 12px; color: var(--ink); text-decoration: none; }
  a.chip:hover { border-color: #b6bec9; }
  .chip.off { opacity: .65; }
  .chip.auth { background: #f4f1ff; border-color: #d9d1f5; }
  .chip code { background: transparent; padding: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .method { display: inline-block; min-width: 52px; text-align: center; padding: 2px 10px;
            border-radius: 7px; font-size: 11.5px; font-weight: 700; color: #fff;
            background: var(--get); letter-spacing: .04em; }
  .method.post { background: var(--post); }
  .method.patch, .method.put { background: var(--putpatch); }
  .method.delete { background: var(--del); }

  /* width:max-content + margin auto: centraliza quando cabe e, quando o
     diagrama é mais largo, rola a partir da esquerda (flex center cortaria). */
  .diagram { overflow-x: auto; padding: 20px 16px; margin-top: 12px;
             background: radial-gradient(#e4e8ee 1px, transparent 1px);
             background-size: 18px 18px; border-top: 1px solid var(--line); }
  .diagram pre.mermaid { width: max-content; margin: 0 auto; background: transparent; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #8a93a3; font-weight: 700; font-size: 11px; letter-spacing: .09em;
       text-transform: uppercase; padding: 10px 12px 8px; border-bottom: 1px solid var(--line);
       background: var(--soft); }
  td { padding: 10px 12px; border-bottom: 1px solid #eef1f4; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  tr:last-child td { border-bottom: 0; }
  td.layer { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
             color: #475061; white-space: nowrap; }
  td.tela .arquivo { color: #98a1b0; font-size: 11.5px; }
  .none { color: #aab2bf; }
  .wrap-scroll { overflow-x: auto; border-top: 1px solid var(--line); }
  .card > .wrap-scroll { border-top: 0; }
  table.telas td { padding: 12px; }

  /* Eventos (IFML) nos chips das telas */
  .evt { color: #7c6bd6; font-size: 11px; border-left: 1px solid var(--line); padding-left: 6px; }

  /* Campos dos schemas (validação) */
  .validacao { margin: 10px 22px 0; display: grid; gap: 6px; }
  .validacao:empty { display: none; }
  .schema-linha { margin: 0; font-size: 12.5px; color: var(--muted); }
  details.schema { font-size: 12.5px; border: 1px dashed var(--line); border-radius: 10px;
                   padding: 6px 12px; background: #fbfcfd; }
  details.schema summary { cursor: pointer; color: var(--muted); }
  details.schema summary span { color: #98a1b0; font-size: 11.5px; }
  details.schema table { margin-top: 8px; }
  details.schema th { background: transparent; }

  /* Matriz papel × rota */
  table.matriz th.papel { text-align: center; }
  table.matriz td.ok, table.matriz td.no { text-align: center; font-weight: 700; width: 90px; }
  table.matriz td.ok { color: #17663a; }
  table.matriz td.no { color: #c2c9d3; }
</style>
</head>
<body>
<div class="topbar">
  <strong>Relatório de rotas</strong>
  <nav>${tocTelas}${tocPermissoes}${tocModulos}</nav>
</div>
<main>
  <header class="hero">
    <p class="overline">TEMPLATE-IA · API + PAINEL</p>
    <h1>Relatório de rotas</h1>
    <p>Fluxo <code>route → controller → service → repository</code> de cada rota da API e o
    cruzamento com as telas do painel que as consomem — tudo por análise estática
    (<code>src/scripts/analyzeRoutes.ts</code>). Regenerar: <code>npm run relatorio:rotas</code>.</p>
    <div class="stats">
      <span>${mods.length} módulos</span>
      <span>${totalRotas} rotas</span>
      <span>${telas.length} telas no painel</span>
      <span>gerado em ${generatedAt}</span>
    </div>
  </header>

  ${telasSection(telas, mods)}

  ${permissoesSection(mods, papeis)}

  <section class="card">
    <p class="label">VISÃO GERAL — MONTAGEM DOS MÓDULOS</p>
    <div class="diagram" style="border-top:0"><pre class="mermaid">${escHtml(overviewDiagram(mods))}</pre></div>
  </section>

  ${sections}
</main>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({
    startOnLoad: true,
    theme: "base",
    // useMaxWidth: false — o diagrama mantém o tamanho natural (sem encolher
    // para caber); o container .diagram centraliza e dá scroll se precisar.
    flowchart: { curve: "basis", htmlLabels: true, nodeSpacing: 46, rankSpacing: 58, useMaxWidth: false },
    themeVariables: {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: "14.5px",
      lineColor: "#8a919c",
      edgeLabelBackground: "#ffffff",
    },
  });
</script>
</body>
</html>
`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const model = buildModel();
const telas = analyzeFrontend();
const papeisSeed = analyzeSeedsPapeis();
writeFileSync(OUT, html(model, telas, papeisSeed));
const totalRoutes = model.reduce((acc, m) => acc + m.routes.length, 0);
console.log(
  `✓ ${model.length} módulos, ${totalRoutes} rotas, ${telas.length} telas, ${papeisSeed.length} papéis → ${OUT}`,
);
