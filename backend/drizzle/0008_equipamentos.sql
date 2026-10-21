CREATE TYPE "public"."entrega_situacao" AS ENUM('demandado', 'aprovado', 'em_compra', 'comprado', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."item_tipo" AS ENUM('investimento', 'custeio');--> statement-breakpoint
CREATE TYPE "public"."pedido_situacao" AS ENUM('aberto', 'em_compra', 'concluido', 'cancelado');--> statement-breakpoint
CREATE TABLE "itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" text NOT NULL,
	"tipo" "item_tipo" NOT NULL,
	"unidade" text DEFAULT 'un' NOT NULL,
	"valor_referencia_centavos" bigint,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "itens_valor_nao_negativo" CHECK ("itens"."valor_referencia_centavos" is null or "itens"."valor_referencia_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pedidos_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"descricao" text,
	"fornecedor" text,
	"situacao" "pedido_situacao" DEFAULT 'aberto' NOT NULL,
	"data_pedido" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entregas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"associacao_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"pedido_id" uuid,
	"lote" text,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor_estimado_centavos" bigint,
	"valor_consolidado_centavos" bigint,
	"situacao" "entrega_situacao" DEFAULT 'demandado' NOT NULL,
	"data_prevista" date,
	"data_entrega" date,
	"termo_uso_key" text,
	"numero_serie" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entregas_quantidade_ck" CHECK ("entregas"."quantidade" > 0),
	CONSTRAINT "entregas_valores_ck" CHECK (coalesce("entregas"."valor_estimado_centavos", 0) >= 0 and coalesce("entregas"."valor_consolidado_centavos", 0) >= 0),
	CONSTRAINT "entregas_entregue_ck" CHECK (("entregas"."situacao" = 'entregue') = ("entregas"."data_entrega" is not null))
);
--> statement-breakpoint
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_pedido_id_pedidos_compra_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_compra"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "itens_descricao_unico_idx" ON "itens" USING btree (lower("descricao")) WHERE "itens"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_compra_numero_unico_idx" ON "pedidos_compra" USING btree ("numero") WHERE "pedidos_compra"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pedidos_compra_projeto_idx" ON "pedidos_compra" USING btree ("projeto_id","situacao");--> statement-breakpoint
CREATE INDEX "entregas_projeto_situacao_idx" ON "entregas" USING btree ("projeto_id","situacao");--> statement-breakpoint
CREATE INDEX "entregas_associacao_idx" ON "entregas" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "entregas_item_idx" ON "entregas" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "entregas_pedido_idx" ON "entregas" USING btree ("pedido_id");