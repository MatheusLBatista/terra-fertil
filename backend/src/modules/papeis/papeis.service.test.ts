import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidarCachePermissoes } from "../../lib/casl/ability.ts";
import { getContext } from "../../lib/requestContext.ts";
import { db } from "../../db/index.ts";
import PapeisRepository from "./papeis.repository.ts";
import PapeisService from "./papeis.service.ts";

// Repository: automock — todo método do protótipo vira vi.fn() (sem banco).
vi.mock("./papeis.repository.ts");

// db: só `transaction` interessa ao service; a callback recebe um `tx` sentinela
// para provar que os repositories receberam a MESMA transação.
const { tx } = vi.hoisted(() => ({ tx: { marcador: "tx" } }));
vi.mock("../../db/index.ts", () => ({
  db: { transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)) },
}));

// Efeito colateral: cache do CASL.
vi.mock("../../lib/casl/ability.ts", () => ({ invalidarCachePermissoes: vi.fn() }));

// Contexto da requisição (papel do usuário logado — regra anti-bloqueio).
vi.mock("../../lib/requestContext.ts", () => ({ getContext: vi.fn() }));

const repo = vi.mocked(PapeisRepository.prototype);
const transaction = vi.mocked(db.transaction);
const invalidar = vi.mocked(invalidarCachePermissoes);
const contexto = vi.mocked(getContext);

const ID = "5f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const papel = { id: ID, nome: "gestor-vendas", descricao: null };
const admin = { id: "a0000000-0000-4000-8000-000000000001", nome: "admin", descricao: null };
const manageAll = [{ acao: "manage" as const, subject: "all" }];
const permissoes = [
  { acao: "read" as const, subject: "Venda" },
  { acao: "read" as const, subject: "Venda" }, // duplicada de propósito
  { acao: "create" as const, subject: "Venda" },
];
const permissoesUnicas = [permissoes[0], permissoes[2]];

let service: PapeisService;

beforeEach(() => {
  vi.resetAllMocks(); // reset (não clear): descarta os mockResolvedValue do teste anterior
  service = new PapeisService();
});

describe("listarPorId", () => {
  it("lança 404 quando o papel não existe", async () => {
    repo.porId.mockResolvedValue(undefined);

    await expect(service.listarPorId(ID)).rejects.toMatchObject({
      statusCode: 404,
      message: "Papel não encontrado",
    });
    expect(repo.listarPermissoes).not.toHaveBeenCalled();
  });

  it("devolve o papel com as permissões quando existe", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue(permissoesUnicas);

    await expect(service.listarPorId(ID)).resolves.toEqual({ ...papel, permissoes: permissoesUnicas });
    expect(repo.listarPermissoes).toHaveBeenCalledWith(ID);
  });
});

describe("criar", () => {
  const entrada = { nome: papel.nome, descricao: "Vendas", permissoes };

  it("lança 409 quando já existe papel ativo com o nome", async () => {
    repo.porNomeIncluindoExcluidos.mockResolvedValue({ ...papel, deletedAt: null });

    await expect(service.criar(entrada)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Já existe um papel "gestor-vendas"',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(repo.inserir).not.toHaveBeenCalled();
  });

  it("lança 409 orientando a reativar quando o nome pertence a um papel excluído", async () => {
    repo.porNomeIncluindoExcluidos.mockResolvedValue({ ...papel, deletedAt: new Date() });

    await expect(service.criar(entrada)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("reative-o"),
    });
  });

  it("insere papel e permissões (sem duplicatas) na mesma transação e invalida o cache do papel", async () => {
    repo.porNomeIncluindoExcluidos.mockResolvedValue(undefined);
    repo.inserir.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue(permissoesUnicas);

    const resultado = await service.criar(entrada);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(repo.inserir).toHaveBeenCalledWith({ nome: papel.nome, descricao: "Vendas" }, tx);
    expect(repo.inserirPermissoes).toHaveBeenCalledWith(ID, permissoesUnicas, tx);
    expect(invalidar).toHaveBeenCalledWith(papel.nome);
    expect(resultado).toEqual({ ...papel, permissoes: permissoesUnicas });
  });
});

describe("alterar", () => {
  it("lança 404 quando o papel não existe", async () => {
    repo.porId.mockResolvedValue(undefined);

    await expect(service.alterar(ID, { descricao: "x" })).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.alterar).not.toHaveBeenCalled();
  });

  it("lança 409 ao renomear para um nome já usado", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.porNomeIncluindoExcluidos.mockResolvedValue({
      id: "outro",
      nome: "admin",
      descricao: null,
      deletedAt: null,
    });

    await expect(service.alterar(ID, { nome: "admin" })).rejects.toMatchObject({ statusCode: 409 });
    expect(repo.alterar).not.toHaveBeenCalled();
  });

  it("não consulta unicidade quando o nome enviado é o atual", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.alterar.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue([]);

    await service.alterar(ID, { nome: papel.nome, descricao: "nova" });

    expect(repo.porNomeIncluindoExcluidos).not.toHaveBeenCalled();
    expect(repo.alterar).toHaveBeenCalledWith(ID, { nome: papel.nome, descricao: "nova" });
  });

  it("lança 409 ao renomear um papel de sistema (admin)", async () => {
    repo.porId.mockResolvedValue(admin);

    await expect(service.alterar(admin.id, { nome: "root" })).rejects.toMatchObject({
      statusCode: 409,
      codigo: "PAPEL_DE_SISTEMA",
    });
    expect(repo.porNomeIncluindoExcluidos).not.toHaveBeenCalled();
    expect(repo.alterar).not.toHaveBeenCalled();
  });

  it("permite mudar só a descrição de um papel de sistema", async () => {
    repo.porId.mockResolvedValue(admin);
    repo.alterar.mockResolvedValue({ ...admin, descricao: "Root" });
    repo.listarPermissoes.mockResolvedValue(manageAll);

    await expect(service.alterar(admin.id, { nome: "admin", descricao: "Root" })).resolves.toMatchObject({
      descricao: "Root",
    });
  });

  it("limpa o cache INTEIRO após alterar (renomear muda a chave do cache)", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.alterar.mockResolvedValue({ ...papel, nome: "vendas" });
    repo.listarPermissoes.mockResolvedValue([]);

    await service.alterar(ID, { nome: "vendas" });

    expect(invalidar).toHaveBeenCalledWith();
  });
});

describe("substituirPermissoes", () => {
  it("lança 404 quando o papel não existe", async () => {
    repo.porId.mockResolvedValue(undefined);

    await expect(service.substituirPermissoes(ID, permissoes)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.substituirPermissoes).not.toHaveBeenCalled();
  });

  it("substitui o conjunto sem duplicatas dentro de transação e invalida o cache do papel", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue(permissoesUnicas);

    await service.substituirPermissoes(ID, permissoes);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(repo.substituirPermissoes).toHaveBeenCalledWith(ID, permissoesUnicas, tx);
    expect(invalidar).toHaveBeenCalledWith(papel.nome);
  });

  it("lança 409 ao deixar um papel de sistema sem permissões", async () => {
    repo.porId.mockResolvedValue(admin);

    await expect(service.substituirPermissoes(admin.id, [])).rejects.toMatchObject({
      statusCode: 409,
      codigo: "PAPEL_DE_SISTEMA",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("lança 409 quando o usuário remove manage Papel/manage all do PRÓPRIO papel", async () => {
    contexto.mockReturnValue({ role: "admin" });
    repo.porId.mockResolvedValue(admin);
    repo.listarPermissoes.mockResolvedValue(manageAll);

    await expect(
      service.substituirPermissoes(admin.id, [{ acao: "read", subject: "Papel" }]),
    ).rejects.toMatchObject({
      statusCode: 409,
      codigo: "AUTO_BLOQUEIO",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deixa trocar manage all por manage Papel no próprio papel (continua gerenciando)", async () => {
    contexto.mockReturnValue({ role: "admin" });
    repo.porId.mockResolvedValue(admin);
    repo.listarPermissoes.mockResolvedValue([{ acao: "manage", subject: "Papel" }]);

    await service.substituirPermissoes(admin.id, [{ acao: "manage", subject: "Papel" }]);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("não aplica a regra anti-bloqueio ao papel de OUTRO usuário", async () => {
    contexto.mockReturnValue({ role: "admin" });
    repo.porId.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue([]);

    await service.substituirPermissoes(ID, [{ acao: "read", subject: "Venda" }]);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("reativar", () => {
  it("lança 404 quando o id não existe (nem excluído)", async () => {
    repo.porIdIncluindoExcluidos.mockResolvedValue(undefined);

    await expect(service.reativar(ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.reativar).not.toHaveBeenCalled();
  });

  it("lança 409 quando o papel não está excluído", async () => {
    repo.porIdIncluindoExcluidos.mockResolvedValue({ ...papel, deletedAt: null });

    await expect(service.reativar(ID)).rejects.toMatchObject({ statusCode: 409, codigo: "PAPEL_ATIVO" });
    expect(repo.reativar).not.toHaveBeenCalled();
  });

  it("reativa, invalida o cache e devolve o papel com permissões", async () => {
    repo.porIdIncluindoExcluidos.mockResolvedValue({ ...papel, deletedAt: new Date() });
    repo.reativar.mockResolvedValue(papel);
    repo.listarPermissoes.mockResolvedValue([]);

    await expect(service.reativar(ID)).resolves.toEqual({ ...papel, permissoes: [] });
    expect(repo.reativar).toHaveBeenCalledWith(ID);
    expect(invalidar).toHaveBeenCalledWith(papel.nome);
  });
});

describe("excluir", () => {
  it("lança 404 quando o papel não existe", async () => {
    repo.porId.mockResolvedValue(undefined);

    await expect(service.excluir(ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.excluir).not.toHaveBeenCalled();
  });

  it("lança 409 ao excluir um papel de sistema, sem consultar uso", async () => {
    repo.porId.mockResolvedValue(admin);

    await expect(service.excluir(admin.id)).rejects.toMatchObject({
      statusCode: 409,
      codigo: "PAPEL_DE_SISTEMA",
    });
    expect(repo.contarUsuariosComPapel).not.toHaveBeenCalled();
    expect(repo.excluir).not.toHaveBeenCalled();
  });

  it("lança 409 quando ainda há usuários com o papel", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.contarUsuariosComPapel.mockResolvedValue(3);

    await expect(service.excluir(ID)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Papel "gestor-vendas" está em uso por 3 usuário(s)',
    });
    expect(repo.excluir).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
  });

  it("faz soft delete e invalida o cache do papel quando ninguém o usa", async () => {
    repo.porId.mockResolvedValue(papel);
    repo.contarUsuariosComPapel.mockResolvedValue(0);
    repo.excluir.mockResolvedValue({ id: ID });

    await service.excluir(ID);

    expect(repo.contarUsuariosComPapel).toHaveBeenCalledWith(papel.nome);
    expect(repo.excluir).toHaveBeenCalledWith(ID);
    expect(invalidar).toHaveBeenCalledWith(papel.nome);
  });
});
