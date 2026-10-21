CREATE TABLE "produtores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"cpf" varchar(11),
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "produtores_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "propriedades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produtor_id" uuid NOT NULL,
	"associacao_id" uuid NOT NULL,
	"nome" text,
	"municipio_id" integer NOT NULL,
	"distrito" text,
	"endereco" text,
	"area_total_ha" numeric(10, 2),
	"area_produtiva_ha" numeric(10, 2),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"car" varchar(60),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "propriedades_area_total_ck" CHECK ("propriedades"."area_total_ha" is null or "propriedades"."area_total_ha" >= 0),
	CONSTRAINT "propriedades_area_produtiva_ck" CHECK ("propriedades"."area_produtiva_ha" is null or ("propriedades"."area_produtiva_ha" >= 0 and ("propriedades"."area_total_ha" is null or "propriedades"."area_produtiva_ha" <= "propriedades"."area_total_ha"))),
	CONSTRAINT "propriedades_coordenadas_ck" CHECK (num_nonnulls("propriedades"."latitude", "propriedades"."longitude") in (0, 2))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number_verified" boolean;--> statement-breakpoint
ALTER TABLE "produtores" ADD CONSTRAINT "produtores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedades" ADD CONSTRAINT "propriedades_produtor_id_produtores_id_fk" FOREIGN KEY ("produtor_id") REFERENCES "public"."produtores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedades" ADD CONSTRAINT "propriedades_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedades" ADD CONSTRAINT "propriedades_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "public"."municipios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "produtores_cpf_unico_idx" ON "produtores" USING btree ("cpf") WHERE "produtores"."deleted_at" is null and "produtores"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "propriedades_produtor_idx" ON "propriedades" USING btree ("produtor_id");--> statement-breakpoint
CREATE INDEX "propriedades_associacao_idx" ON "propriedades" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "propriedades_municipio_idx" ON "propriedades" USING btree ("municipio_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");