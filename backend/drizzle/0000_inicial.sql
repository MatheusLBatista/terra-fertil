CREATE TYPE "public"."acao_permissao" AS ENUM('manage', 'create', 'read', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."operacao_historico" AS ENUM('INSERT', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "historico_alteracoes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tabela" text NOT NULL,
	"registro_id" text NOT NULL,
	"operacao" "operacao_historico" NOT NULL,
	"dados_anteriores" jsonb,
	"dados_novos" jsonb,
	"alterado_por" text,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papeis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "papeis_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "permissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papel_id" uuid NOT NULL,
	"acao" "acao_permissao" NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estados" (
	"id" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"sigla" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "estados_sigla_unique" UNIQUE("sigla")
);
--> statement-breakpoint
CREATE TABLE "municipios" (
	"id" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"estado_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_papeis_nome_fk" FOREIGN KEY ("role") REFERENCES "public"."papeis"("nome") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes" ADD CONSTRAINT "permissoes_papel_id_papeis_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papeis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_estado_id_estados_id_fk" FOREIGN KEY ("estado_id") REFERENCES "public"."estados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_alteracoes_tabela_idx" ON "historico_alteracoes" USING btree ("tabela");--> statement-breakpoint
CREATE INDEX "historico_alteracoes_registro_idx" ON "historico_alteracoes" USING btree ("tabela","registro_id");--> statement-breakpoint
CREATE INDEX "historico_alteracoes_alterado_em_idx" ON "historico_alteracoes" USING btree ("alterado_em");--> statement-breakpoint
CREATE INDEX "historico_alteracoes_alterado_por_idx" ON "historico_alteracoes" USING btree ("alterado_por");--> statement-breakpoint
CREATE UNIQUE INDEX "permissoes_papel_acao_subject_idx" ON "permissoes" USING btree ("papel_id","acao","subject") WHERE "permissoes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "permissoes_papel_idx" ON "permissoes" USING btree ("papel_id");--> statement-breakpoint
CREATE INDEX "municipios_estado_idx" ON "municipios" USING btree ("estado_id");