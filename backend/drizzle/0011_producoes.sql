CREATE TYPE "public"."producao_tipo" AS ENUM('relatorio_tecnico_participativo', 'relatorio_tecnico', 'resumo_cientifico', 'relatorio_pesquisa');--> statement-breakpoint
CREATE TABLE "producoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"tipo" "producao_tipo" NOT NULL,
	"meta_id" uuid,
	"concluida_em" date,
	"arquivo_key" text,
	"url" text,
	"resumo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "producao_autores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producao_id" uuid NOT NULL,
	"projeto_equipe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "producoes" ADD CONSTRAINT "producoes_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producoes" ADD CONSTRAINT "producoes_meta_id_metas_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_autores" ADD CONSTRAINT "producao_autores_producao_id_producoes_id_fk" FOREIGN KEY ("producao_id") REFERENCES "public"."producoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_autores" ADD CONSTRAINT "producao_autores_projeto_equipe_id_projeto_equipe_id_fk" FOREIGN KEY ("projeto_equipe_id") REFERENCES "public"."projeto_equipe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "producoes_projeto_tipo_idx" ON "producoes" USING btree ("projeto_id","tipo");--> statement-breakpoint
CREATE INDEX "producoes_meta_idx" ON "producoes" USING btree ("meta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "producao_autores_unico_idx" ON "producao_autores" USING btree ("producao_id","projeto_equipe_id") WHERE "producao_autores"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "producao_autores_producao_idx" ON "producao_autores" USING btree ("producao_id");--> statement-breakpoint
CREATE INDEX "producao_autores_equipe_idx" ON "producao_autores" USING btree ("projeto_equipe_id");