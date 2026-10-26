CREATE TYPE "public"."item_categoria" AS ENUM('insumo', 'maquina', 'implemento', 'equipamento');--> statement-breakpoint
CREATE TABLE "visita_itens_verificados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"entrega_id" uuid NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "visitas" DROP CONSTRAINT "visitas_tipo_alvo_ck";--> statement-breakpoint
ALTER TABLE "visita_anexos" ADD COLUMN "entrega_id" uuid;--> statement-breakpoint
ALTER TABLE "itens" ADD COLUMN "categoria" "item_categoria";--> statement-breakpoint
-- Itens já cadastrados: custeio vira insumo; tratores e colhedoras, máquina; o resto do investimento, implemento (revise no painel)
UPDATE "itens" SET "categoria" = CASE
  WHEN "tipo" = 'custeio' THEN 'insumo'::"item_categoria"
  WHEN "descricao" ~* '^(trator|colhedora)' THEN 'maquina'::"item_categoria"
  ELSE 'implemento'::"item_categoria"
END;--> statement-breakpoint
ALTER TABLE "itens" ALTER COLUMN "categoria" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "visita_itens_verificados" ADD CONSTRAINT "visita_itens_verificados_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_itens_verificados" ADD CONSTRAINT "visita_itens_verificados_entrega_id_entregas_id_fk" FOREIGN KEY ("entrega_id") REFERENCES "public"."entregas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_itens_verificados_unico_idx" ON "visita_itens_verificados" USING btree ("visita_id","entrega_id") WHERE "visita_itens_verificados"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "visita_itens_verificados_visita_idx" ON "visita_itens_verificados" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "visita_itens_verificados_entrega_idx" ON "visita_itens_verificados" USING btree ("entrega_id");--> statement-breakpoint
ALTER TABLE "visita_anexos" ADD CONSTRAINT "visita_anexos_entrega_id_entregas_id_fk" FOREIGN KEY ("entrega_id") REFERENCES "public"."entregas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visita_anexos_entrega_idx" ON "visita_anexos" USING btree ("entrega_id");--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_tipo_alvo_ck" CHECK ("visitas"."tipo" = 'acompanhamento' or ("visitas"."tipo" = 'inicial_associacao') = ("visitas"."associacao_id" is not null));