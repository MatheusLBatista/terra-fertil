import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.ts";
import { papel } from "../db/papel.ts";
import { permissao, type NewPermissao } from "../db/permissao.ts";

/**
 * Papéis e permissões (RBAC dirigido pelo banco — o CASL carrega daqui).
 * Ao criar um módulo novo, adicione as permissões do subject dele neste seed
 * e rode `npm run db:seed:papeis` (ou insira direto na tabela `permissoes`).
 * Idempotente: só insere o que não existe. Papel soft-deletado com o mesmo
 * nome é REATIVADO (o unique de `nome` é total — a FK de user.role exige).
 */
export const PAPEIS_DEMO: {
  nome: string;
  descricao: string;
  permissoes: { acao: NewPermissao["acao"]; subject: string }[];
}[] = [
  {
    nome: "admin",
    descricao: "Acesso total ao sistema",
    permissoes: [{ acao: "manage", subject: "all" }],
  },
  {
    nome: "gestor",
    descricao: "Gerencia os cadastros do domínio e lê a auditoria",
    permissoes: [
      { acao: "read", subject: "HistoricoAlteracao" },
      // permissões dos módulos do domínio entram aqui (ex.: { acao: "manage", subject: "SeuSubject" })
    ],
  },
  {
    nome: "usuario",
    descricao: "Somente leitura no domínio",
    permissoes: [
      // ex.: { acao: "read", subject: "SeuSubject" }
    ],
  },
];

export async function seedPapeis() {
  console.log("Seeding papéis e permissões...");

  for (const p of PAPEIS_DEMO) {
    // Inclui soft-deletados: não dá para inserir outro com o mesmo nome
    const [existente] = await db
      .select({ id: papel.id, deletedAt: papel.deletedAt })
      .from(papel)
      .where(eq(papel.nome, p.nome))
      .limit(1);

    let papelId: string;
    if (!existente) {
      [{ id: papelId }] = await db
        .insert(papel)
        .values({ nome: p.nome, descricao: p.descricao })
        .returning({ id: papel.id });
    } else {
      papelId = existente.id;
      if (existente.deletedAt) {
        await db.update(papel).set({ deletedAt: null }).where(eq(papel.id, papelId));
        console.log(`  ~ ${p.nome}: estava excluído — reativado`);
      }
    }

    const atuais = await db
      .select({ acao: permissao.acao, subject: permissao.subject })
      .from(permissao)
      .where(and(eq(permissao.papelId, papelId), isNull(permissao.deletedAt)));
    const jaTem = new Set(atuais.map((a) => `${a.acao}:${a.subject}`));

    const faltantes = p.permissoes.filter((perm) => !jaTem.has(`${perm.acao}:${perm.subject}`));
    if (faltantes.length > 0) {
      await db.insert(permissao).values(faltantes.map((perm) => ({ papelId, ...perm })));
    }

    console.log(`  + ${p.nome}: ${p.permissoes.length} permissão(ões) (${faltantes.length} nova(s))`);
  }

  console.log("✓ Papéis e permissões seedados.");
}

if (process.argv[1]?.endsWith("papeis.ts")) {
  seedPapeis()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
