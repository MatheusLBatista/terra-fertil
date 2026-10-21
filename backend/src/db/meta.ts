import {
  pgTable,
  uuid,
  text,
  smallint,
  bigint,
  numeric,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { metaSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Meta de um projeto (as 10 do Terra Fértil). % concluída e % do projeto são
 * CALCULADOS a partir das etapas (src/modules/metas) — não ficam aqui.
 */
export const meta = pgTable(
  "metas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    numero: smallint("numero").notNull(),
    descricao: text("descricao").notNull(),
    valorAprovadoCentavos: bigint("valor_aprovado_centavos", { mode: "number" }).notNull().default(0),
    peso: numeric("peso", { precision: 5, scale: 2, mode: "number" }).notNull(),
    situacao: metaSituacaoEnum("situacao").notNull().default("nao_iniciado"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("metas_projeto_numero_unico_idx")
      .on(t.projetoId, t.numero)
      .where(sql`${t.deletedAt} is null`),
    index("metas_projeto_idx").on(t.projetoId),
    check("metas_valor_nao_negativo", sql`${t.valorAprovadoCentavos} >= 0`),
    check("metas_peso_ck", sql`${t.peso} >= 0 and ${t.peso} <= 100`),
    check("metas_numero_ck", sql`${t.numero} > 0`),
  ],
);

export type Meta = typeof meta.$inferSelect;
export type NewMeta = typeof meta.$inferInsert;
