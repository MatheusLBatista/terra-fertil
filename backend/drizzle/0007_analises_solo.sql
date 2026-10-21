CREATE TABLE "analises_solo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"propriedade_id" uuid NOT NULL,
	"visita_id" uuid,
	"identificada_em" date NOT NULL,
	"observacao" text,
	"laudo_url" text,
	"laudo_registrado_em" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "analises_solo_laudo_ck" CHECK (("analises_solo"."laudo_url" is null) = ("analises_solo"."laudo_registrado_em" is null))
);
--> statement-breakpoint
ALTER TABLE "analises_solo" ADD CONSTRAINT "analises_solo_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analises_solo" ADD CONSTRAINT "analises_solo_propriedade_id_propriedades_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analises_solo" ADD CONSTRAINT "analises_solo_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analises_solo_projeto_data_idx" ON "analises_solo" USING btree ("projeto_id","identificada_em");--> statement-breakpoint
CREATE INDEX "analises_solo_propriedade_idx" ON "analises_solo" USING btree ("propriedade_id");--> statement-breakpoint
CREATE INDEX "analises_solo_visita_idx" ON "analises_solo" USING btree ("visita_id");