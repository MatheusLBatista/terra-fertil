import { randomUUID } from "node:crypto";
import { asc, eq, ilike, or } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { user } from "../../db/user.ts";
import { ehEmailTecnico } from "../../lib/documentos.ts";

export type Pessoa = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  papel: string | null;
};

const colunas = {
  id: user.id,
  nome: user.name,
  email: user.email,
  telefone: user.phoneNumber,
  papel: user.role,
};

/** O e-mail técnico de quem não tem e-mail não sai da API — vira null. */
const paraPessoa = (row: {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: string | null;
}) => ({
  ...row,
  email: ehEmailTecnico(row.email) ? null : row.email,
});

export default class PessoasRepository {
  async buscar({ busca, limit }: { busca?: string; limit: number }, tx: DbOrTx = db): Promise<Pessoa[]> {
    const termo = busca ? `%${escaparLike(busca)}%` : undefined;
    const rows = await tx
      .select(colunas)
      .from(user)
      .where(
        termo
          ? or(ilike(user.name, termo), ilike(user.email, termo), ilike(user.phoneNumber, termo))
          : undefined,
      )
      .orderBy(asc(user.name), asc(user.id))
      .limit(limit);
    return rows.map(paraPessoa);
  }

  async porId(id: string, tx: DbOrTx = db): Promise<Pessoa | undefined> {
    const [row] = await tx.select(colunas).from(user).where(eq(user.id, id)).limit(1);
    return row ? paraPessoa(row) : undefined;
  }

  async porEmail(email: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    return row;
  }

  async porTelefone(telefone: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.phoneNumber, telefone)).limit(1);
    return row;
  }

  /**
   * Usuário SEM credencial (nenhuma linha em `account`): existe para o domínio,
   * mas só entra no painel depois que um admin definir senha (ou, no futuro,
   * por OTP no telefone). Inserido direto na tabela do better-auth.
   */
  async inserir(
    data: { nome: string; email: string; telefone?: string; papel: string },
    tx: DbOrTx = db,
  ): Promise<Pessoa> {
    const [row] = await tx
      .insert(user)
      .values({
        id: randomUUID().replace(/-/g, ""),
        name: data.nome,
        email: data.email,
        phoneNumber: data.telefone ?? null,
        role: data.papel,
      })
      .returning(colunas);
    return paraPessoa(row);
  }
}
