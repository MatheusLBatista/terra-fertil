import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.ts";
import { papel } from "../db/papel.ts";
import { permissao, type NewPermissao } from "../db/permissao.ts";

/**
 * Papéis e permissões (RBAC dirigido pelo banco — o CASL carrega daqui).
 * Ao criar um módulo novo, adicione as permissões do subject dele neste seed
 * e rode `bun run db:seed:papeis` (ou insira direto na tabela `permissoes`).
 * Idempotente: só insere o que não existe. Papel soft-deletado com o mesmo
 * nome é REATIVADO (o unique de `nome` é total — a FK de user.role exige).
 * `acessoTodosProjetos: true` é aplicado também a papel que já existe (só liga,
 * nunca desliga — quem desliga é o painel).
 */
type Perm = { acao: NewPermissao["acao"]; subject: string };

/**
 * Subjects do domínio Terra Fértil. O gestor gerencia todos; o técnico atua no
 * campo (o que ele vê é limitado pelo escopo de projetos — src/lib/escopo.ts);
 * o usuário só lê.
 */
const SUBJECTS_DOMINIO = [
  "Projeto",
  "Pessoa",
  "Associacao",
  "TipoDocumento",
  "OpcaoDiagnostico",
  "Item",
  "Produtor",
  "Propriedade",
  "Evento",
  "Producao",
  "AnaliseSolo",
  "PedidoCompra",
  "Entrega",
];
const gerencia = (subjects: string[]): Perm[] => subjects.map((subject) => ({ acao: "manage", subject }));
const le = (subjects: string[]): Perm[] => subjects.map((subject) => ({ acao: "read", subject }));

const PERMISSOES_TECNICO: Perm[] = [
  ...le(["Projeto", "Pessoa", "Associacao", "TipoDocumento", "OpcaoDiagnostico", "Item"]),
  { acao: "create", subject: "Pessoa" },
  { acao: "create", subject: "Associacao" },
  { acao: "update", subject: "Associacao" },
  ...["Produtor", "Propriedade"].flatMap((subject): Perm[] => [
    { acao: "read", subject },
    { acao: "create", subject },
    { acao: "update", subject },
  ]),
  ...gerencia(["Evento", "Producao", "AnaliseSolo"]),
  { acao: "read", subject: "PedidoCompra" },
  { acao: "read", subject: "Entrega" },
  { acao: "create", subject: "Entrega" },
  { acao: "update", subject: "Entrega" },
];

export const PAPEIS_DEMO: {
  nome: string;
  descricao: string;
  acessoTodosProjetos?: boolean;
  permissoes: Perm[];
}[] = [
  {
    nome: "admin",
    descricao: "Acesso total ao sistema",
    acessoTodosProjetos: true,
    permissoes: [{ acao: "manage", subject: "all" }],
  },
  {
    nome: "gestor",
    descricao: "Gerencia os cadastros do domínio e lê a auditoria",
    acessoTodosProjetos: true,
    permissoes: [{ acao: "read", subject: "HistoricoAlteracao" }, ...gerencia(SUBJECTS_DOMINIO)],
  },
  {
    nome: "tecnico",
    descricao: "Equipe de campo: visitas, análises de solo e atendimento nos projetos em que atua",
    permissoes: PERMISSOES_TECNICO,
  },
  {
    nome: "produtor",
    descricao: "Produtor rural ou contato de associação (acesso ao painel a definir)",
    permissoes: [],
  },
  {
    nome: "usuario",
    descricao: "Somente leitura no domínio",
    permissoes: le(SUBJECTS_DOMINIO),
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
        .values({ nome: p.nome, descricao: p.descricao, acessoTodosProjetos: p.acessoTodosProjetos ?? false })
        .returning({ id: papel.id });
    } else {
      papelId = existente.id;
      if (existente.deletedAt) {
        await db.update(papel).set({ deletedAt: null }).where(eq(papel.id, papelId));
        console.log(`  ~ ${p.nome}: estava excluído — reativado`);
      }
      if (p.acessoTodosProjetos) {
        await db.update(papel).set({ acessoTodosProjetos: true }).where(eq(papel.id, papelId));
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
