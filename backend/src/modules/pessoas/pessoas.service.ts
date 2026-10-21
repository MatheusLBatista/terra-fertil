import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { emailTecnico } from "../../lib/documentos.ts";
import type { DbOrTx } from "../../db/index.ts";
import PessoasRepository from "./pessoas.repository.ts";
import type { ListPessoasQuerySchema, NovaPessoaSchema } from "./pessoas.schema.ts";

type NovaPessoa = z.infer<typeof NovaPessoaSchema>;

export default class PessoasService {
  private repository = new PessoasRepository();

  async buscar(query: z.infer<typeof ListPessoasQuerySchema>) {
    return this.repository.buscar(query);
  }

  /** Papel de quem é cadastrado pelo painel do domínio, salvo indicação contrária. */
  async criar(data: NovaPessoa, papel = "produtor", tx?: DbOrTx) {
    const email = data.email?.toLowerCase();
    if (email && (await this.repository.porEmail(email, tx))) {
      throw new AppError(
        "Já existe uma pessoa com este e-mail — selecione-a em vez de cadastrar outra",
        409,
        undefined,
        "PESSOA_DUPLICADA",
      );
    }
    if (data.telefone && (await this.repository.porTelefone(data.telefone, tx))) {
      throw new AppError(
        "Já existe uma pessoa com este telefone — selecione-a em vez de cadastrar outra",
        409,
        undefined,
        "PESSOA_DUPLICADA",
      );
    }
    // Sem e-mail: o better-auth exige um — vai o técnico (telefone ou aleatório)
    const emailFinal = email ?? emailTecnico(data.telefone ?? crypto.randomUUID());
    return this.repository.inserir(
      { nome: data.nome, email: emailFinal, telefone: data.telefone, papel },
      tx,
    );
  }

  /** `userId` existente ou `pessoa` nova — usado por produtores, contatos e equipe. */
  async resolver(ref: { userId?: string; pessoa?: NovaPessoa }, papel: string, tx?: DbOrTx) {
    if (ref.userId) {
      const existente = await this.repository.porId(ref.userId, tx);
      if (!existente) throw new AppError("Pessoa não encontrada", 404);
      return existente;
    }
    if (!ref.pessoa) throw new AppError("Informe a pessoa", 400);
    return this.criar(ref.pessoa, papel, tx);
  }
}
