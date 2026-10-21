import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { invalidarCachePermissoes } from "../../lib/casl/ability.ts";
import { getContext } from "../../lib/requestContext.ts";
import PapeisRepository, { type PermissaoDoPapel } from "./papeis.repository.ts";
import type { ListPapeisQuerySchema, CreatePapelSchema, UpdatePapelSchema } from "./papeis.schema.ts";

type ListQuery = z.infer<typeof ListPapeisQuerySchema>;
type CreateData = z.infer<typeof CreatePapelSchema>;
type UpdateData = z.infer<typeof UpdatePapelSchema>;

/**
 * Papéis de SISTEMA: o código depende deles (adminRoles do better-auth,
 * defaultRole do cadastro). Não podem ser renomeados, excluídos nem ficar
 * sem permissões — senão o painel fica sem administrador.
 */
export const PAPEIS_DE_SISTEMA = ["admin"] as const;

const ehDeSistema = (nome: string) => (PAPEIS_DE_SISTEMA as readonly string[]).includes(nome);

/** Permissões que dão gestão do RBAC — o usuário não pode tirá-las do próprio papel. */
const gerenciaPapeis = (p: PermissaoDoPapel) =>
  p.acao === "manage" && (p.subject === "all" || p.subject === "Papel");

/** Remove pares (acao, subject) repetidos do payload. */
function dedupe(permissoes: PermissaoDoPapel[]): PermissaoDoPapel[] {
  const vistos = new Set<string>();
  return permissoes.filter((p) => {
    const chave = `${p.acao}:${p.subject}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export default class PapeisService {
  private repository = new PapeisRepository();

  async listar({ incluir, ...query }: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    if (incluir !== "permissoes") return { itens, total };

    // Uma query extra (inArray) para todos os papéis da página — sem N+1
    const permissoes = await this.repository.listarPermissoesDePapeis(itens.map((p) => p.id));
    return { itens: itens.map((p) => ({ ...p, permissoes: permissoes.get(p.id) ?? [] })), total };
  }

  async listarPorId(id: string) {
    const encontrado = await this.repository.porId(id);
    if (!encontrado) throw new AppError("Papel não encontrado", 404);
    const permissoes = await this.repository.listarPermissoes(id);
    return { ...encontrado, permissoes };
  }

  async criar({ permissoes, ...data }: CreateData) {
    await this.garantirNomeLivre(data.nome);

    // Transação: papel e permissões nascem juntos ou nada é gravado
    const novo = await db.transaction(async (tx) => {
      const criado = await this.repository.inserir(data, tx);
      await this.repository.inserirPermissoes(criado.id, dedupe(permissoes), tx);
      return criado;
    });

    invalidarCachePermissoes(novo.nome);
    return { ...novo, permissoes: await this.repository.listarPermissoes(novo.id) };
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.repository.porId(id);
    if (!atual) throw new AppError("Papel não encontrado", 404);

    if (data.nome && data.nome !== atual.nome) {
      if (ehDeSistema(atual.nome)) {
        throw new AppError(
          `Papel "${atual.nome}" é de sistema e não pode ser renomeado`,
          409,
          undefined,
          "PAPEL_DE_SISTEMA",
        );
      }
      await this.garantirNomeLivre(data.nome);
    }

    const alterado = await this.repository.alterar(id, data);
    // Excluído entre a leitura e o UPDATE (corrida) — o UPDATE não pegou linha
    if (!alterado) throw new AppError("Papel não encontrado", 404);
    // Renomear muda a chave do cache (e user.role via FK cascade) — limpa tudo
    invalidarCachePermissoes();
    return { ...alterado, permissoes: await this.repository.listarPermissoes(id) };
  }

  async substituirPermissoes(id: string, permissoes: PermissaoDoPapel[]) {
    const atual = await this.repository.porId(id);
    if (!atual) throw new AppError("Papel não encontrado", 404);

    const novas = dedupe(permissoes);

    if (ehDeSistema(atual.nome) && novas.length === 0) {
      throw new AppError(
        `Papel "${atual.nome}" é de sistema e não pode ficar sem permissões`,
        409,
        undefined,
        "PAPEL_DE_SISTEMA",
      );
    }

    // Anti-bloqueio: quem edita o PRÓPRIO papel não pode tirar dele a gestão
    // de papéis (manage Papel / manage all) — perderia o acesso a esta tela.
    if (atual.nome === getContext()?.role && !novas.some(gerenciaPapeis)) {
      const atuais = await this.repository.listarPermissoes(id);
      if (atuais.some(gerenciaPapeis)) {
        throw new AppError(
          "Você não pode remover a permissão de gerenciar papéis (manage Papel / manage all) do seu próprio papel",
          409,
          undefined,
          "AUTO_BLOQUEIO",
        );
      }
    }

    await db.transaction(async (tx) => {
      await this.repository.substituirPermissoes(id, novas, tx);
    });

    invalidarCachePermissoes(atual.nome);
    return { ...atual, permissoes: await this.repository.listarPermissoes(id) };
  }

  async excluir(id: string) {
    const atual = await this.repository.porId(id);
    if (!atual) throw new AppError("Papel não encontrado", 404);

    if (ehDeSistema(atual.nome)) {
      throw new AppError(
        `Papel "${atual.nome}" é de sistema e não pode ser excluído`,
        409,
        undefined,
        "PAPEL_DE_SISTEMA",
      );
    }

    const emUso = await this.repository.contarUsuariosComPapel(atual.nome);
    if (emUso > 0) {
      throw new AppError(
        `Papel "${atual.nome}" está em uso por ${emUso} usuário(s)`,
        409,
        undefined,
        "PAPEL_EM_USO",
      );
    }

    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Papel não encontrado", 404);
    invalidarCachePermissoes(atual.nome);
  }

  /** Desfaz o soft delete — é o caminho para "recriar" um nome já usado (unique total). */
  async reativar(id: string) {
    const atual = await this.repository.porIdIncluindoExcluidos(id);
    if (!atual) throw new AppError("Papel não encontrado", 404);
    if (!atual.deletedAt)
      throw new AppError(`Papel "${atual.nome}" não está excluído`, 409, undefined, "PAPEL_ATIVO");

    const reativado = await this.repository.reativar(id);
    if (!reativado) throw new AppError("Papel não encontrado", 404);
    invalidarCachePermissoes(atual.nome);
    return { ...reativado, permissoes: await this.repository.listarPermissoes(id) };
  }

  /** `nome` tem unique TOTAL (FK de user.role) — soft-deletado também conflita. */
  private async garantirNomeLivre(nome: string) {
    const existente = await this.repository.porNomeIncluindoExcluidos(nome);
    if (existente) {
      throw new AppError(
        existente.deletedAt
          ? `Já existe um papel "${nome}" excluído — reative-o (POST /papeis/${existente.id}/reativar) em vez de criar outro`
          : `Já existe um papel "${nome}"`,
        409,
        undefined,
        existente.deletedAt ? "PAPEL_EXCLUIDO" : "PAPEL_DUPLICADO",
      );
    }
  }
}
