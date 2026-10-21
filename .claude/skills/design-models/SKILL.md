---
name: design-models
description: Cria um model Drizzle (tabela PostgreSQL + tipos) no back-end, com auditoria e soft delete. Use ao adicionar uma nova entidade/tabela ao banco — "criar model X", "nova tabela", "adicionar entidade".
---

# Criar model (Drizzle)

Modelo de referência: `backend/src/db/municipio.ts` (tabela com FK + índice + auditoria). Leia-o antes de criar qualquer model. Próximo passo depois do model: skill `create-routes`.

## Passos

1. **Leia o padrão**: `backend/src/db/municipio.ts` (estrutura de model), `backend/src/db/audit.ts` (colunas de auditoria) e `backend/src/db/papel.ts` (unique total por causa de FK).

2. **Crie `backend/src/db/<entidade>.ts`** (singular, camelCase) seguindo as regras:
   - PK: `uuid("id").primaryKey().defaultRandom()` — exceto tabelas de referência com código externo (estados/municípios usam o código IBGE como `integer` PK). **Toda tabela auditada precisa de PK**: a trigger de histórico (`src/db/triggers/historico.sql`) lê a chave primária real pelo catálogo (`fn_historico_registro_id`; PK composta vira valores unidos por `:`) e só cai na coluna `id` se não houver PK — tabela sem PK fica com `registro_id` nulo no histórico.
   - **Sempre termine as colunas com `...auditColumns`** (import de `./audit.ts`; vale para todo model de domínio — as exceções de infraestrutura estão logo abaixo da lista). Isso dá `createdAt/updatedAt/createdBy/updatedBy/deletedAt` — e a presença de `deleted_at` faz a trigger cobrir a tabela automaticamente.
   - **Timestamps sempre `timestamp("x", { withTimezone: true })`** (`timestamptz`) — como as colunas de auditoria; sem timezone o valor muda de significado conforme o `TZ` do container (o `docker-compose.yml` de dev fixa `TZ=UTC` no Postgres, mas o dado precisa ser inequívoco).
   - Dinheiro em **centavos** (`integer`), nunca float, com **check constraint** de não negativo (nenhum model do template tem dinheiro ainda — o `produto` hipotético abaixo mostra o `check()`). Conversão e formatação ficam em `src/lib/dinheiro.ts` (`paraCentavos`, `deCentavos`, `formatarCentavos`) — nunca `* 100` na mão.
   - **Toda FK ganha índice** (`index("<tabela>_<coluna>_idx").on(t.coluna)`): o Postgres não indexa FK sozinho, e toda listagem filtra/joina por ela.
   - FKs: `.references(() => outra.id, { onDelete: "restrict" })` (ou `cascade` quando o filho não faz sentido sem o pai).
   - Status/tipos fechados: `pgEnum` declarado em `src/db/enums.ts` (nunca inline).
   - Unicidade que respeita soft delete → unique parcial. Exceção: coluna que é alvo de FK (ex.: `papel.nome` ← `user.role`) precisa de `.unique()` TOTAL — o service então checa o nome incluindo excluídos e oferece "reative" (veja `papeis.service.ts` e o endpoint `reativar` na skill `create-routes`). Outra exceção aceita: dado de referência carregado por seed que a aplicação nunca soft-deleta (`estados.sigla` — sem rota de escrita, o unique total só protege o seed).
   - Exporte os tipos: `export type X = typeof x.$inferSelect; export type NewX = typeof x.$inferInsert;`
   - Nomes de tabela/coluna em `snake_case`; tabela no plural.

   **Exceções deliberadas (não copie como padrão)**: as tabelas do better-auth (`user`, `session`, `account`, `verification`) mantêm os nomes no singular e o formato que o better-auth espera, **sem** `auditColumns` — o adapter do better-auth grava nelas direto e não há soft delete de sessão/conta (por isso a trigger de histórico não as cobre). `historico_alteracoes` também não tem `auditColumns`: é o próprio log. Todo model de **domínio** segue as regras acima.

   Exemplo com tudo isso (entidade `produto`):

   ```ts
   import { pgTable, uuid, text, integer, boolean, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
   import { sql } from "drizzle-orm";
   import { categoria } from "./categoria.ts";
   import { auditColumns } from "./audit.ts";

   export const produto = pgTable(
     "produtos",
     {
       id:            uuid("id").primaryKey().defaultRandom(),
       nome:          text("nome").notNull(),
       categoriaId:   uuid("categoria_id").notNull().references(() => categoria.id, { onDelete: "restrict" }),
       precoCentavos: integer("preco_centavos").notNull(),
       ativo:         boolean("ativo").notNull().default(true),
       validoAte:     timestamp("valido_ate", { withTimezone: true }),
       ...auditColumns,
     },
     (t) => [
       index("produtos_categoria_idx").on(t.categoriaId),
       uniqueIndex("produtos_nome_unico_idx").on(t.nome).where(sql`${t.deletedAt} is null`),
       check("produtos_preco_nao_negativo", sql`${t.precoCentavos} >= 0`),
     ],
   );

   export type Produto    = typeof produto.$inferSelect;
   export type NewProduto = typeof produto.$inferInsert;
   ```

3. **Registre no barrel** `backend/src/db/schema.ts`: `export * from "./<entidade>.ts";` — sem isso a tabela não entra na migration.

4. **Gere a migration e aplique** (o template usa migrations versionadas desde o dia 1 — `backend/drizzle/` é commitado):
   ```bash
   cd backend
   bun run db:generate     # cria drizzle/<n>_<nome>.sql a partir do model — commite junto
   bun run db:setup        # drizzle-kit migrate + trigger de histórico (db:triggers) + seeds — idempotente
   ```
   Leia o SQL gerado antes de aplicar (renomear coluna vira drop + create se o drizzle não entender). `drizzle-kit push` (`DB_SCHEMA_MODE=push` ou `bun run db:setup -- --push`) só serve para protótipo sem dados reais: um banco criado por push não aceita a primeira migration depois. No deploy, o serviço `migrate` do compose de deploy roda o mesmo `db:setup` antes da API subir.

   O `db:setup` já aplica a trigger de histórico em toda tabela com `deleted_at` — não precisa rodar `bun run db:triggers` à parte (ele só serve quando a tabela foi criada por outro caminho, ex.: `db:migrate` direto).

5. **Valide**: `bun run typecheck` (ou `bun run check` na raiz).

## Checklist

- [ ] Model de domínio criado com `...auditColumns` no final e PK declarada (normalmente `id`)
- [ ] Timestamps com `withTimezone: true`; dinheiro em centavos + `check(... >= 0)`
- [ ] Índice em cada FK; unique parcial (`where deleted_at is null`) ou total quando a coluna é alvo de FK
- [ ] Enum (se houver) em `src/db/enums.ts`
- [ ] Re-export no barrel `src/db/schema.ts`
- [ ] `bun run db:generate` (migration commitada) → `bun run db:setup`
- [ ] `bun run typecheck` verde
