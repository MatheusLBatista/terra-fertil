CREATE TYPE "public"."equipe_tipo" AS ENUM('coordenador', 'tecnico', 'estudante', 'administrativo');--> statement-breakpoint
CREATE TYPE "public"."projeto_situacao" AS ENUM('planejado', 'em_execucao', 'encerrado');--> statement-breakpoint
CREATE TABLE "projetos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sigla" text NOT NULL,
	"nome" text NOT NULL,
	"numero_instrumento" text,
	"concedente" text,
	"executor" text,
	"inicio" date NOT NULL,
	"fim" date NOT NULL,
	"valor_total_centavos" bigint DEFAULT 0 NOT NULL,
	"situacao" "projeto_situacao" DEFAULT 'planejado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projetos_periodo_ck" CHECK ("projetos"."fim" >= "projetos"."inicio"),
	CONSTRAINT "projetos_valor_nao_negativo" CHECK ("projetos"."valor_total_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projeto_equipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"tipo" "equipe_tipo" NOT NULL,
	"funcao" text,
	"instituicao" text,
	"curso" text,
	"contratado_em" date,
	"desligado_em" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projeto_equipe_periodo_ck" CHECK ("projeto_equipe"."desligado_em" is null or "projeto_equipe"."contratado_em" is null or "projeto_equipe"."desligado_em" >= "projeto_equipe"."contratado_em")
);
--> statement-breakpoint
ALTER TABLE "papeis" ADD COLUMN "acesso_todos_projetos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projeto_equipe" ADD CONSTRAINT "projeto_equipe_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_equipe" ADD CONSTRAINT "projeto_equipe_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projetos_sigla_unico_idx" ON "projetos" USING btree (lower("sigla")) WHERE "projetos"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projetos_situacao_idx" ON "projetos" USING btree ("situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "projeto_equipe_projeto_user_unico_idx" ON "projeto_equipe" USING btree ("projeto_id","user_id") WHERE "projeto_equipe"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projeto_equipe_projeto_idx" ON "projeto_equipe" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "projeto_equipe_user_idx" ON "projeto_equipe" USING btree ("user_id");