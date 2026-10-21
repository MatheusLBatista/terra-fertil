import type { z } from "zod";
import { db, type DbOrTx } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { emailTecnico } from "../../lib/documentos.ts";
import { escopoAtual, garantirAssociacao } from "../../lib/escopo.ts";
import { getCurrentUserId } from "../../lib/requestContext.ts";
import PessoasService from "../pessoas/pessoas.service.ts";
import ProdutoresRepository, { type Visibilidade } from "./produtores.repository.ts";
import type {
  ListProdutoresQuerySchema,
  CreateProdutorSchema,
  UpdateProdutorSchema,
} from "./produtores.schema.ts";

type ListQuery = z.infer<typeof ListProdutoresQuerySchema>;
type CreateData = z.infer<typeof CreateProdutorSchema>;
type UpdateData = z.infer<typeof UpdateProdutorSchema>;

/** Pessoa nova cadastrada como produtor nasce com este papel. */
const PAPEL_PRODUTOR = "produtor";

/** Escopo + usuário da requisição — o critério de visibilidade do produtor. */
export async function visibilidadeAtual(): Promise<Visibilidade> {
  return { escopo: await escopoAtual(), userId: getCurrentUserId() };
}

export default class ProdutoresService {
  private repository = new ProdutoresRepository();
  private pessoas = new PessoasService();

  async listar({ associacaoId, ...query }: ListQuery) {
    // Filtro por associação fora do escopo → 404 (não revela que existe)
    if (associacaoId) await garantirAssociacao(associacaoId);
    const filtros = { ...query, associacaoId, ...(await visibilidadeAtual()) };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const encontrado = await this.repository.porId(id, await visibilidadeAtual());
    if (!encontrado) throw new AppError("Produtor não encontrado", 404);
    return encontrado;
  }

  async criar({ userId, pessoa, ...data }: CreateData) {
    const id = await db.transaction(async (tx) => {
      const p = await this.pessoas.resolver({ userId, pessoa }, PAPEL_PRODUTOR, tx);
      // `user_id` é unique TOTAL: perfil excluído é reativado, não recriado
      const existente = await this.repository.porUsuarioIncluindoExcluidos(p.id, tx);
      if (existente?.deletedAt) {
        throw new AppError(
          `${p.nome} já teve um perfil de produtor, que foi excluído — reative-o (POST /produtores/${existente.id}/reativar) em vez de criar outro`,
          409,
          undefined,
          "PRODUTOR_EXCLUIDO",
        );
      }
      if (existente) {
        throw new AppError(
          `${p.nome} já está cadastrado(a) como produtor`,
          409,
          undefined,
          "PRODUTOR_DUPLICADO",
        );
      }
      if (data.cpf) await this.garantirCpfLivre(data.cpf, undefined, tx);
      const criado = await this.repository.inserir({ userId: p.id, ...data }, tx);
      return criado.id;
    });
    // Quem cadastrou enxerga o produtor (created_by) mesmo antes da 1ª propriedade
    return this.listarPorId(id);
  }

  async alterar(id: string, { nome, email, telefone, ...data }: UpdateData) {
    const atual = await this.listarPorId(id);
    const mexeNaPessoa = nome !== undefined || email !== undefined || telefone !== undefined;

    await db.transaction(async (tx) => {
      if (data.cpf && data.cpf !== atual.cpf) await this.garantirCpfLivre(data.cpf, id, tx);

      if (mexeNaPessoa) {
        const pessoa = await this.repository.pessoa(atual.userId, tx);
        if (!pessoa) throw new AppError("Pessoa não encontrada", 404);
        // Quem tem outro papel (técnico, gestor...) acessa o painel: e-mail e telefone
        // são credenciais — a edição é na gestão de usuários, não pelo produtor
        if (pessoa.papel && pessoa.papel !== PAPEL_PRODUTOR) {
          throw new AppError(
            `Os dados de ${atual.nome} são gerenciados no cadastro de usuários (papel "${pessoa.papel}")`,
            409,
            undefined,
            "PESSOA_COM_OUTRO_PAPEL",
          );
        }

        let emailFinal: string | undefined;
        if (email === null) {
          // Sem e-mail: volta a ter um técnico (o better-auth exige um)
          if (atual.email !== null) emailFinal = emailTecnico(crypto.randomUUID());
        } else if (email !== undefined && email !== pessoa.email) {
          if (await this.repository.outraPessoaComEmail(email, pessoa.id, tx)) {
            throw new AppError("Já existe outra pessoa com este e-mail", 409, undefined, "PESSOA_DUPLICADA");
          }
          emailFinal = email;
        }

        if (telefone && telefone !== pessoa.telefone) {
          if (await this.repository.outraPessoaComTelefone(telefone, pessoa.id, tx)) {
            throw new AppError(
              "Já existe outra pessoa com este telefone",
              409,
              undefined,
              "PESSOA_DUPLICADA",
            );
          }
        }

        await this.repository.alterarPessoa(
          pessoa.id,
          { name: nome, email: emailFinal, phoneNumber: telefone },
          tx,
        );
      }

      const alterado = await this.repository.alterar(id, data, tx);
      // Excluído entre a leitura e o UPDATE (corrida)
      if (!alterado) throw new AppError("Produtor não encontrado", 404);
    });

    return this.listarPorId(id);
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    const propriedades = await this.repository.contarPropriedades(id);
    if (propriedades > 0) {
      throw new AppError(
        `${atual.nome} tem ${propriedades} propriedade(s) cadastrada(s) — exclua-as antes ou marque o produtor como inativo`,
        409,
        undefined,
        "PRODUTOR_EM_USO",
      );
    }
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Produtor não encontrado", 404);
  }

  /** Desfaz o soft delete — é o caminho para "recadastrar" o mesmo usuário (unique total). */
  async reativar(id: string) {
    const atual = await this.repository.porIdIncluindoExcluidos(id);
    const { escopo, userId } = await visibilidadeAtual();
    // Excluído não tem propriedades vivas: com escopo limitado, só quem o cadastrou o enxerga
    const visivel = atual && (escopo === undefined || (userId !== null && atual.createdBy === userId));
    if (!atual || !visivel) throw new AppError("Produtor não encontrado", 404);
    if (!atual.deletedAt) {
      throw new AppError("O produtor não está excluído", 409, undefined, "PRODUTOR_ATIVO");
    }
    if (atual.cpf) await this.garantirCpfLivre(atual.cpf, id);

    const reativado = await this.repository.reativar(id);
    if (!reativado) throw new AppError("Produtor não encontrado", 404);
    return this.listarPorId(id);
  }

  private async garantirCpfLivre(cpf: string, excetoId?: string, tx?: DbOrTx) {
    if (await this.repository.porCpf(cpf, excetoId, tx)) {
      throw new AppError("Já existe um produtor com este CPF", 409, undefined, "CPF_DUPLICADO");
    }
  }
}
