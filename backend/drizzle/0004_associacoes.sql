CREATE TYPE "public"."contato_funcao" AS ENUM('presidente', 'contato', 'outro');--> statement-breakpoint
CREATE TYPE "public"."documento_situacao" AS ENUM('pendente', 'recebido', 'validado', 'rejeitado');--> statement-breakpoint
CREATE TABLE "associacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sigla" text NOT NULL,
	"nome" text,
	"cnpj" varchar(14),
	"municipio_id" integer NOT NULL,
	"distrito" text,
	"endereco" text,
	"num_produtores" integer,
	"num_familias" integer,
	"area_media_ha" numeric(10, 2),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"mapa_url" text,
	"grupo_whatsapp_url" text,
	"dados_revisados" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "associacoes_num_produtores_ck" CHECK ("associacoes"."num_produtores" is null or "associacoes"."num_produtores" >= 0),
	CONSTRAINT "associacoes_num_familias_ck" CHECK ("associacoes"."num_familias" is null or "associacoes"."num_familias" >= 0),
	CONSTRAINT "associacoes_area_media_ck" CHECK ("associacoes"."area_media_ha" is null or "associacoes"."area_media_ha" >= 0),
	CONSTRAINT "associacoes_coordenadas_ck" CHECK (num_nonnulls("associacoes"."latitude", "associacoes"."longitude") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "associacao_contatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"associacao_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"funcao" "contato_funcao" DEFAULT 'contato' NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"desde" date,
	"ate" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tipos_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"obrigatorio" boolean DEFAULT true NOT NULL,
	"por_projeto" boolean DEFAULT false NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "associacao_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"associacao_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"projeto_id" uuid,
	"situacao" "documento_situacao" DEFAULT 'pendente' NOT NULL,
	"arquivo_key" text,
	"nome_arquivo" text,
	"mime_type" text,
	"tamanho_bytes" integer,
	"validade" date,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "associacao_documentos_tamanho_ck" CHECK ("associacao_documentos"."tamanho_bytes" is null or "associacao_documentos"."tamanho_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projeto_associacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"associacao_id" uuid NOT NULL,
	"aderiu_em" date,
	"interesse_declarado" boolean,
	"demanda_inicial" text,
	"valor_sugerido_centavos" bigint,
	"parceria_formalizada_em" date,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projeto_associacoes_valor_ck" CHECK ("projeto_associacoes"."valor_sugerido_centavos" is null or "projeto_associacoes"."valor_sugerido_centavos" >= 0)
);
--> statement-breakpoint
ALTER TABLE "associacoes" ADD CONSTRAINT "associacoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "public"."municipios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_contatos" ADD CONSTRAINT "associacao_contatos_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_contatos" ADD CONSTRAINT "associacao_contatos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_documentos" ADD CONSTRAINT "associacao_documentos_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_documentos" ADD CONSTRAINT "associacao_documentos_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_documentos" ADD CONSTRAINT "associacao_documentos_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_associacoes" ADD CONSTRAINT "projeto_associacoes_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_associacoes" ADD CONSTRAINT "projeto_associacoes_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "associacoes_municipio_sigla_unico_idx" ON "associacoes" USING btree ("municipio_id",lower("sigla")) WHERE "associacoes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "associacoes_cnpj_unico_idx" ON "associacoes" USING btree ("cnpj") WHERE "associacoes"."deleted_at" is null and "associacoes"."cnpj" is not null;--> statement-breakpoint
CREATE INDEX "associacoes_municipio_idx" ON "associacoes" USING btree ("municipio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "associacao_contatos_associacao_user_unico_idx" ON "associacao_contatos" USING btree ("associacao_id","user_id") WHERE "associacao_contatos"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "associacao_contatos_principal_unico_idx" ON "associacao_contatos" USING btree ("associacao_id") WHERE "associacao_contatos"."principal" and "associacao_contatos"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "associacao_contatos_associacao_idx" ON "associacao_contatos" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "associacao_contatos_user_idx" ON "associacao_contatos" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_documento_nome_unico_idx" ON "tipos_documento" USING btree (lower("nome")) WHERE "tipos_documento"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "associacao_documentos_vigente_unico_idx" ON "associacao_documentos" USING btree ("associacao_id","tipo_documento_id",coalesce("projeto_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "associacao_documentos"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "associacao_documentos_associacao_idx" ON "associacao_documentos" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "associacao_documentos_tipo_idx" ON "associacao_documentos" USING btree ("tipo_documento_id");--> statement-breakpoint
CREATE INDEX "associacao_documentos_projeto_idx" ON "associacao_documentos" USING btree ("projeto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projeto_associacoes_unico_idx" ON "projeto_associacoes" USING btree ("projeto_id","associacao_id") WHERE "projeto_associacoes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projeto_associacoes_projeto_idx" ON "projeto_associacoes" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "projeto_associacoes_associacao_idx" ON "projeto_associacoes" USING btree ("associacao_id");