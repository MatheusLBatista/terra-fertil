---
name: testes-unitarios
description: Teste unitário (vitest) de um service do back-end com regras de negócio — 404/409, transições de estado, transação, efeitos colaterais (cache/e-mail/storage) — mockando o repository, sem banco nem HTTP. Use ao criar ou revisar `<entidade>.service.test.ts` — "testar o service de X", "teste unitário de X", "cobrir a regra de 409".
---

# testes-unitarios — service com regra, repository mockado

Exemplo real e completo: `backend/src/modules/papeis/papeis.service.test.ts`. Leia-o antes de escrever o primeiro teste; tudo abaixo deriva dele.

## O que testar (e o que não)

Teste o **service** quando ele decide algo: lança `AppError` (404, 409), muda estado, abre transação, dispara efeito colateral (`invalidarCachePermissoes`, `sendEmail`, `uploadToS3`). Cada regra vira um `it`.

Fora do escopo desta skill: repository (é SQL — só o banco prova), controller (é parse + envelope), service que só repassa (`listar` → `repository.listar` sem decisão). Passthrough não ganha teste.

## Onde e como rodar

- Arquivo: `<entidade>.service.test.ts` ao lado do service (`vitest.config.ts` inclui `src/**/*.test.ts`; `tsconfig.build.json` os exclui do `dist`).
- `cd backend && npm test` (uma vez) · `npm run test:watch` (contínuo). Sem `.env`, sem Postgres, sem API no ar.
- `make check` (raiz) roda typecheck + lint + estes unitários do back e typecheck + lint do front — é o gate antes do commit; o CI roda o mesmo.

## Padrão de mock (3 blocos, no topo do arquivo)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidarCachePermissoes } from "../../lib/casl/ability.ts";
import { db } from "../../db/index.ts";
import XRepository from "./x.repository.ts";
import XService from "./x.service.ts";

// 1. Repository: automock — cada método do protótipo vira vi.fn() (sem banco).
vi.mock("./x.repository.ts");

// 2. db: só `transaction`; a callback recebe um `tx` sentinela para provar que
//    os repositories receberam a MESMA transação. `vi.hoisted` porque vi.mock é içado.
const { tx } = vi.hoisted(() => ({ tx: { marcador: "tx" } }));
vi.mock("../../db/index.ts", () => ({
  db: { transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)) },
}));

// 3. Efeitos colaterais: um vi.fn() por função usada pelo service.
vi.mock("../../lib/casl/ability.ts", () => ({ invalidarCachePermissoes: vi.fn() }));

const repo = vi.mocked(XRepository.prototype);      // repo.porId.mockResolvedValue(...)
const transaction = vi.mocked(db.transaction);
const invalidar = vi.mocked(invalidarCachePermissoes);

let service: XService;
beforeEach(() => {
  vi.resetAllMocks(); // reset, não clear: descarta os mockResolvedValue do teste anterior
  service = new XService();
});
```

- Service que não abre transação: omita o bloco 2 **mas mantenha um `vi.mock("../../db/index.ts", () => ({ db: {} }))`** se o service importa `db` — o módulo real cria um `Pool` e lê `.env`.
- Mocke só o que o service importa. E-mail: `vi.mock("../../lib/mail/fsmail.ts", () => ({ sendEmail: vi.fn() }))`. Storage: `vi.mock("../../lib/storage/upload.ts", () => ({ uploadToS3: vi.fn(), downloadFromS3: vi.fn() }))`.
- Método do repository que pode devolver nada precisa declarar `Promise<X | undefined>`, senão `mockResolvedValue(undefined)` não compila — corrija a assinatura no repository, nunca com cast no teste.

## Asserções

```ts
// AppError: status E mensagem (toMatchObject aceita parcial)
await expect(service.excluir(ID)).rejects.toMatchObject({
  statusCode: 409,
  message: 'Papel "gestor-vendas" está em uso por 3 usuário(s)',
});
// Mensagem longa/variável: expect.stringContaining("reative-o")

// A regra bloqueou a escrita
expect(repo.excluir).not.toHaveBeenCalled();
expect(transaction).not.toHaveBeenCalled();

// Escrita na transação certa e efeito colateral com o argumento certo
expect(repo.inserirPermissoes).toHaveBeenCalledWith(ID, permissoesUnicas, tx);
expect(invalidar).toHaveBeenCalledWith(papel.nome);
expect(invalidar).toHaveBeenCalledWith();            // sem argumento = limpou tudo
```

## Estrutura e nomes

- Um `describe` por método público do service; um `it` por regra.
- Nome do `it` em pt-BR, no formato "lança 404 quando ...", "não consulta ... quando ...", "faz soft delete e invalida ... quando ...".
- Fixtures no topo (`ID`, `papel`, `permissoes`), dados mínimos para a regra — sem factories genéricas.
- Determinístico: sem `Date.now()` solto em asserção (use `expect.any(Date)`), sem `Math.random`, sem rede.
- Só `toEqual`/`toMatchObject`/`toHaveBeenCalledWith` — snapshot escondem a regra.

## Checklist

- [ ] Cada `throw new AppError` do service tem um `it` com `statusCode` e mensagem
- [ ] Cada caminho feliz prova a escrita (`toHaveBeenCalledWith`) e o efeito colateral
- [ ] Cada regra que bloqueia prova o `not.toHaveBeenCalled()` da escrita
- [ ] Nada importa `src/db/index.ts` real (mock presente)
- [ ] `npm test` e `npm run typecheck` verdes (ou `make check` na raiz)
