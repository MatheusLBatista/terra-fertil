CREATE TYPE "public"."apuracao_tipo" AS ENUM('automatica', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lancamento_tipo" AS ENUM('liberacao', 'despesa');--> statement-breakpoint
CREATE TYPE "public"."meta_situacao" AS ENUM('nao_iniciado', 'em_execucao', 'concluido');--> statement-breakpoint
CREATE TABLE "metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"descricao" text NOT NULL,
	"valor_aprovado_centavos" bigint DEFAULT 0 NOT NULL,
	"peso" numeric(5, 2) NOT NULL,
	"situacao" "meta_situacao" DEFAULT 'nao_iniciado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "metas_valor_nao_negativo" CHECK ("metas"."valor_aprovado_centavos" >= 0),
	CONSTRAINT "metas_peso_ck" CHECK ("metas"."peso" >= 0 and "metas"."peso" <= 100),
	CONSTRAINT "metas_numero_ck" CHECK ("metas"."numero" > 0)
);
--> statement-breakpoint
CREATE TABLE "indicadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "etapas_indicador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicador_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"quantidade_prevista" integer NOT NULL,
	"peso" numeric(5, 2) NOT NULL,
	"apuracao" "apuracao_tipo" NOT NULL,
	"chave" text,
	"quantidade_manual" integer,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "etapas_indicador_apuracao_ck" CHECK (("etapas_indicador"."apuracao" = 'automatica') = ("etapas_indicador"."chave" is not null)),
	CONSTRAINT "etapas_indicador_prevista_ck" CHECK ("etapas_indicador"."quantidade_prevista" > 0),
	CONSTRAINT "etapas_indicador_peso_ck" CHECK ("etapas_indicador"."peso" >= 0 and "etapas_indicador"."peso" <= 100),
	CONSTRAINT "etapas_indicador_manual_ck" CHECK ("etapas_indicador"."quantidade_manual" is null or "etapas_indicador"."quantidade_manual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lancamentos_financeiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"meta_id" uuid,
	"tipo" "lancamento_tipo" NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data" date NOT NULL,
	"documento_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lancamentos_financeiros_valor_ck" CHECK ("lancamentos_financeiros"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_meta_id_metas_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas_indicador" ADD CONSTRAINT "etapas_indicador_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_meta_id_metas_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metas_projeto_numero_unico_idx" ON "metas" USING btree ("projeto_id","numero") WHERE "metas"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "metas_projeto_idx" ON "metas" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "indicadores_meta_idx" ON "indicadores" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "etapas_indicador_indicador_idx" ON "etapas_indicador" USING btree ("indicador_id");--> statement-breakpoint
CREATE INDEX "lancamentos_financeiros_projeto_data_idx" ON "lancamentos_financeiros" USING btree ("projeto_id","data");--> statement-breakpoint
CREATE INDEX "lancamentos_financeiros_meta_idx" ON "lancamentos_financeiros" USING btree ("meta_id");