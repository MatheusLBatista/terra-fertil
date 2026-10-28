import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/index.ts";
import { assinatura, type NewAssinatura } from "../../db/assinatura.ts";
import { associacaoContato } from "../../db/associacaoContato.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { user } from "../../db/user.ts";

/** Pessoa que pode assinar o alvo, com o vínculo dela (função na associação ou proprietário). */
export type Assinante = {
  userId: string;
  nome: string;
  vinculo: "presidente" | "contato" | "outro" | "proprietario";
};

/** O alvo da assinatura: exatamente uma das três FKs. */
export type AlvoAssinatura = { visitaId: string } | { entregaId: string } | { associacaoDocumentoId: string };

const doAlvo = (alvo: AlvoAssinatura) =>
  "visitaId" in alvo
    ? eq(assinatura.visitaId, alvo.visitaId)
    : "entregaId" in alvo
      ? eq(assinatura.entregaId, alvo.entregaId)
      : eq(assinatura.associacaoDocumentoId, alvo.associacaoDocumentoId);

const colunas = {
  id: assinatura.id,
  userId: assinatura.userId,
  nome: assinatura.nome,
  papel: assinatura.papel,
  assinadoEm: assinatura.assinadoEm,
  registradoPorNome: user.name,
};

export default class AssinaturasRepository {
  /** Assinatura viva do alvo, com a key da imagem (uso interno — não vai na resposta). */
  async porAlvo(alvo: AlvoAssinatura, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunas, imagemKey: assinatura.imagemKey })
      .from(assinatura)
      .leftJoin(user, eq(user.id, assinatura.createdBy))
      .where(and(doAlvo(alvo), isNull(assinatura.deletedAt)))
      .limit(1);
    return row;
  }

  /** Contatos vivos e vigentes (sem `ate` no passado) da associação — o principal primeiro. */
  async contatosDaAssociacao(associacaoId: string, tx: DbOrTx = db): Promise<Assinante[]> {
    return tx
      .select({ userId: associacaoContato.userId, nome: user.name, vinculo: associacaoContato.funcao })
      .from(associacaoContato)
      .innerJoin(user, eq(user.id, associacaoContato.userId))
      .where(
        and(
          eq(associacaoContato.associacaoId, associacaoId),
          isNull(associacaoContato.deletedAt),
          or(isNull(associacaoContato.ate), gte(associacaoContato.ate, sql`current_date`)),
        ),
      )
      .orderBy(desc(associacaoContato.principal), asc(user.name));
  }

  /** O produtor dono da propriedade. */
  async produtorDaPropriedade(propriedadeId: string, tx: DbOrTx = db): Promise<Assinante[]> {
    return tx
      .select({ userId: produtor.userId, nome: user.name, vinculo: sql<"proprietario">`'proprietario'` })
      .from(propriedade)
      .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(and(eq(propriedade.id, propriedadeId), isNull(propriedade.deletedAt)));
  }

  async inserir(data: NewAssinatura, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(assinatura).values(data).returning({ id: assinatura.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(assinatura)
      .set({ deletedAt: new Date() })
      .where(and(eq(assinatura.id, id), isNull(assinatura.deletedAt)))
      .returning({ id: assinatura.id });
    return row;
  }
}
