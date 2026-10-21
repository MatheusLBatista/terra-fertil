CREATE TYPE "public"."evento_situacao" AS ENUM('planejado', 'realizado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."evento_tipo" AS ENUM('curso', 'oficina', 'dia_de_campo', 'palestra', 'intercambio');--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"tipo" "evento_tipo" NOT NULL,
	"tema_id" uuid,
	"associacao_id" uuid,
	"municipio_id" integer NOT NULL,
	"local" text,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"carga_horaria" numeric(5, 1),
	"instrutor" text,
	"situacao" "evento_situacao" DEFAULT 'planejado' NOT NULL,
	"relato" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "eventos_periodo_ck" CHECK ("eventos"."fim" >= "eventos"."inicio"),
	CONSTRAINT "eventos_carga_horaria_ck" CHECK ("eventos"."carga_horaria" is null or "eventos"."carga_horaria" > 0)
);
--> statement-breakpoint
CREATE TABLE "evento_participantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"produtor_id" uuid NOT NULL,
	"presente" boolean DEFAULT false NOT NULL,
	"certificado_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_tema_id_opcoes_diagnostico_id_fk" FOREIGN KEY ("tema_id") REFERENCES "public"."opcoes_diagnostico"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "public"."municipios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_participantes" ADD CONSTRAINT "evento_participantes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_participantes" ADD CONSTRAINT "evento_participantes_produtor_id_produtores_id_fk" FOREIGN KEY ("produtor_id") REFERENCES "public"."produtores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_projeto_inicio_idx" ON "eventos" USING btree ("projeto_id","inicio");--> statement-breakpoint
CREATE INDEX "eventos_tema_idx" ON "eventos" USING btree ("tema_id");--> statement-breakpoint
CREATE INDEX "eventos_associacao_idx" ON "eventos" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "eventos_municipio_idx" ON "eventos" USING btree ("municipio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evento_participantes_unico_idx" ON "evento_participantes" USING btree ("evento_id","produtor_id") WHERE "evento_participantes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "evento_participantes_evento_idx" ON "evento_participantes" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "evento_participantes_produtor_idx" ON "evento_participantes" USING btree ("produtor_id");