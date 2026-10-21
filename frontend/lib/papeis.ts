"use client";

import { authClient } from "@/lib/auth-client";

/**
 * Papel do usuário — é o `user.role` do Better Auth, com FK para `papeis.nome`
 * no banco. O backend traduz papel → permissões (CASL, tabela `permissoes`);
 * aqui o papel só decide o que aparece no menu e nas telas.
 *
 * Os papéis são DINÂMICOS (tabela `papeis`, CRUD em /papeis): para selects use
 * `usePapeisDinamicos()` (hooks/use-papeis.ts). A lista abaixo são os papéis do
 * SEED — servem de fallback e de régua de nível para o menu; um papel criado em
 * runtime não entra em `NIVEIS` e conta como `usuario` (o nível mais baixo):
 * vê Dashboard e os cadastros de leitura, não vê a administração.
 *
 * Esconder o que o backend recusaria evita 403 em tela; **não** esconda o que
 * o backend permite. A checagem de verdade é sempre do servidor.
 */
export const PAPEIS = ["admin", "gestor", "usuario"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Ordem de precedência: `podeGerenciar("gestor")` aceita gestor e admin. */
const NIVEIS: Record<Papel, number> = { usuario: 10, gestor: 20, admin: 30 };

const nivelDe = (papel: string) => NIVEIS[papel as Papel] ?? NIVEIS.usuario;

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: "Acesso total ao sistema",
  gestor: "Gerencia os cadastros do domínio e lê a auditoria",
  usuario: "Somente leitura no domínio",
};

/**
 * O plugin `admin` do Better Auth tipa o `role` de `setRole`/`createUser` como
 * "user" | "admin" (o padrão dele). Os papéis deste projeto vêm da tabela
 * `papeis` e o backend aceita qualquer string — o cast só atravessa a tipagem.
 */
export const papelParaApi = (papel: string) => papel as "admin";

export function usePapel() {
  const { data: session, isPending } = authClient.useSession();
  const papel = session?.user.role ?? "usuario";

  return {
    papel,
    carregando: isPending,
    ehAdmin: papel === "admin",
    /** O papel do usuário atende ao mínimo pedido? */
    podeGerenciar: (minimo: Papel = "gestor") => nivelDe(papel) >= NIVEIS[minimo],
    /**
     * Registra o trabalho de campo (associações, produtores, visitas, solo…).
     * O técnico fica fora da régua do seed (conta como "usuario" no menu), mas o
     * backend dá a ele escrita nesses módulos — limitada aos projetos da equipe.
     */
    podeEditarCampo: papel === "tecnico" || nivelDe(papel) >= NIVEIS.gestor,
  };
}
