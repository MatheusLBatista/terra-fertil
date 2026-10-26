CREATE TABLE "visita_atividades_verificadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"opcao_id" uuid NOT NULL,
	"subdivisao_id" uuid,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subdivisoes_atividade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opcao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "visita_anexos" ADD COLUMN "atividade_verificada_id" uuid;--> statement-breakpoint
ALTER TABLE "visita_atividades_verificadas" ADD CONSTRAINT "visita_atividades_verificadas_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_atividades_verificadas" ADD CONSTRAINT "visita_atividades_verificadas_opcao_id_opcoes_diagnostico_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcoes_diagnostico"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_atividades_verificadas" ADD CONSTRAINT "visita_atividades_verificadas_subdivisao_id_subdivisoes_atividade_id_fk" FOREIGN KEY ("subdivisao_id") REFERENCES "public"."subdivisoes_atividade"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subdivisoes_atividade" ADD CONSTRAINT "subdivisoes_atividade_opcao_id_opcoes_diagnostico_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcoes_diagnostico"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visita_atividades_verificadas_unico_idx" ON "visita_atividades_verificadas" USING btree ("visita_id","opcao_id",coalesce("subdivisao_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "visita_atividades_verificadas"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "visita_atividades_verificadas_visita_idx" ON "visita_atividades_verificadas" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "visita_atividades_verificadas_opcao_idx" ON "visita_atividades_verificadas" USING btree ("opcao_id");--> statement-breakpoint
CREATE INDEX "visita_atividades_verificadas_subdivisao_idx" ON "visita_atividades_verificadas" USING btree ("subdivisao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subdivisoes_atividade_nome_unico_idx" ON "subdivisoes_atividade" USING btree ("opcao_id",lower("nome")) WHERE "subdivisoes_atividade"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subdivisoes_atividade_opcao_idx" ON "subdivisoes_atividade" USING btree ("opcao_id");--> statement-breakpoint
ALTER TABLE "visita_anexos" ADD CONSTRAINT "visita_anexos_atividade_verificada_id_visita_atividades_verificadas_id_fk" FOREIGN KEY ("atividade_verificada_id") REFERENCES "public"."visita_atividades_verificadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visita_anexos_atividade_verificada_idx" ON "visita_anexos" USING btree ("atividade_verificada_id");