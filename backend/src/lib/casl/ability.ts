import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import PapeisRepository from "../../modules/papeis/papeis.repository.ts";

/**
 * Autorização com CASL, dirigida pelo BANCO (tabelas `papeis` e `permissoes`):
 *
 * - `Action`  → o que se quer fazer (`manage` = tudo).
 * - `Subject` → sobre o quê (nome registrado pelo módulo, ex.: "HistoricoAlteracao",
 *               ou "all"). Um módulo novo NÃO altera código aqui — registra suas
 *               permissões no seed de papéis (src/seeds/papeis.ts) ou direto no banco.
 * - `defineAbilityFor(user)` → carrega as permissões do papel do usuário.
 *
 * O middleware `requirePermission(action, subject)` (src/middlewares/requirePermission.ts)
 * aplica isto nas rotas; os services podem fazer checagens por instância com
 * `ability.can("update", subject("SeuSubject", registro))`.
 *
 * As permissões ficam em cache por papel (TTL curto) para não consultar o banco
 * a cada request. Após alterar `permissoes` em runtime, chame
 * `invalidarCachePermissoes()` — ou aguarde o TTL.
 */

export type Action = "manage" | "create" | "read" | "update" | "delete";
export type Subject = string;

export type AppAbility = MongoAbility<[Action, Subject]>;

export interface AbilityUser {
  id: string;
  role?: string;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { permissoes: { acao: Action; subject: string }[]; expiraEm: number }>();
const repository = new PapeisRepository();

async function permissoesDoPapel(nomePapel: string) {
  const hit = cache.get(nomePapel);
  if (hit && hit.expiraEm > Date.now()) return hit.permissoes;

  const permissoes = await repository.listarPermissoesPorPapel(nomePapel);
  cache.set(nomePapel, { permissoes, expiraEm: Date.now() + CACHE_TTL_MS });
  return permissoes;
}

export function invalidarCachePermissoes(nomePapel?: string) {
  if (nomePapel) cache.delete(nomePapel);
  else cache.clear();
}

export async function defineAbilityFor(user: AbilityUser | null): Promise<AppAbility> {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // Leituras públicas de referência (estados/municípios) não passam pelo CASL —
  // são liberadas direto nas rotas. Sem papel (ou papel sem permissões), nega tudo.
  if (user?.role) {
    for (const p of await permissoesDoPapel(user.role)) {
      can(p.acao, p.subject);
    }
  }

  return build();
}
