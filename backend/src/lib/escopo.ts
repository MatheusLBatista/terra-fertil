import { AppError } from "./appError.ts";
import { getContext } from "./requestContext.ts";
import ProjetosRepository from "../modules/projetos/projetos.repository.ts";

/**
 * ESCOPO de acesso por projeto (complementa o CASL, que decide "o papel pode
 * ler Visita?"; o escopo decide "de quais projetos?").
 *
 * - Papel com `acesso_todos_projetos` (admin e gestor no seed) → todos.
 * - Os demais → só os projetos em que a pessoa tem `projeto_equipe` ativo.
 *
 * Registro de projeto fora do escopo responde 404 (não revela que existe).
 * Os repositories recebem `escopo: string[] | undefined` — `undefined` = sem filtro.
 * Cache de 30 s por papel e por usuário (mesmo esquema das permissões);
 * `invalidarCacheEscopo()` ao mexer na equipe ou na flag do papel.
 */
export type Escopo = string[] | undefined;

const TTL_MS = 30_000;
const cachePapel = new Map<string, { todos: boolean; expiraEm: number }>();
const cacheUsuario = new Map<string, { ids: string[]; expiraEm: number }>();
const repository = new ProjetosRepository();

async function papelVeTodos(papel: string): Promise<boolean> {
  const hit = cachePapel.get(papel);
  if (hit && hit.expiraEm > Date.now()) return hit.todos;
  const todos = await repository.papelVeTodosOsProjetos(papel);
  cachePapel.set(papel, { todos, expiraEm: Date.now() + TTL_MS });
  return todos;
}

async function projetosDaEquipe(userId: string): Promise<string[]> {
  const hit = cacheUsuario.get(userId);
  if (hit && hit.expiraEm > Date.now()) return hit.ids;
  const ids = await repository.projetosDaEquipe(userId);
  cacheUsuario.set(userId, { ids, expiraEm: Date.now() + TTL_MS });
  return ids;
}

export function invalidarCacheEscopo() {
  cachePapel.clear();
  cacheUsuario.clear();
}

/** Projetos que o usuário da requisição enxerga (`undefined` = todos). */
export async function escopoAtual(): Promise<Escopo> {
  const ctx = getContext();
  if (!ctx?.userId) return [];
  if (ctx.role && (await papelVeTodos(ctx.role))) return undefined;
  return projetosDaEquipe(ctx.userId);
}

export const noEscopo = (escopo: Escopo, projetoId: string) =>
  escopo === undefined || escopo.includes(projetoId);

/**
 * Garante que o projeto existe e está no escopo (404 caso contrário). Com
 * `escrita`, recusa projeto encerrado (409) — ele é somente leitura.
 */
export async function garantirProjeto(projetoId: string, { escrita = false } = {}) {
  const escopo = await escopoAtual();
  const projeto = noEscopo(escopo, projetoId) ? await repository.porId(projetoId) : undefined;
  if (!projeto) throw new AppError("Projeto não encontrado", 404);
  if (escrita && projeto.situacao === "encerrado") {
    throw new AppError("Projeto encerrado é somente leitura", 409, undefined, "PROJETO_ENCERRADO");
  }
  return projeto;
}
