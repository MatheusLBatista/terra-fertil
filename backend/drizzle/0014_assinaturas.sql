CREATE TYPE "public"."assinante_papel" AS ENUM('presidente', 'vice_presidente', 'proprietario', 'outro');--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid,
	"entrega_id" uuid,
	"associacao_documento_id" uuid,
	"nome" text NOT NULL,
	"papel" "assinante_papel" NOT NULL,
	"imagem_key" text NOT NULL,
	"assinado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assinaturas_alvo_ck" CHECK (num_nonnulls("assinaturas"."visita_id", "assinaturas"."entrega_id", "assinaturas"."associacao_documento_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_entrega_id_entregas_id_fk" FOREIGN KEY ("entrega_id") REFERENCES "public"."entregas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_associacao_documento_id_associacao_documentos_id_fk" FOREIGN KEY ("associacao_documento_id") REFERENCES "public"."associacao_documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_visita_unico_idx" ON "assinaturas" USING btree ("visita_id") WHERE "assinaturas"."deleted_at" is null and "assinaturas"."visita_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_entrega_unico_idx" ON "assinaturas" USING btree ("entrega_id") WHERE "assinaturas"."deleted_at" is null and "assinaturas"."entrega_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_documento_unico_idx" ON "assinaturas" USING btree ("associacao_documento_id") WHERE "assinaturas"."deleted_at" is null and "assinaturas"."associacao_documento_id" is not null;--> statement-breakpoint
CREATE INDEX "assinaturas_visita_idx" ON "assinaturas" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "assinaturas_entrega_idx" ON "assinaturas" USING btree ("entrega_id");--> statement-breakpoint
CREATE INDEX "assinaturas_documento_idx" ON "assinaturas" USING btree ("associacao_documento_id");