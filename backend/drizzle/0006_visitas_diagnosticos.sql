CREATE TYPE "public"."anexo_tipo" AS ENUM('foto', 'documento', 'audio');--> statement-breakpoint
CREATE TYPE "public"."grupo_opcao" AS ENUM('atividade_produtiva', 'problema_solo', 'tema_capacitacao', 'parceiro_institucional', 'apoio_necessario');--> statement-breakpoint
CREATE TYPE "public"."recomendacao_categoria" AS ENUM('calagem', 'adubacao', 'manejo_solo', 'manejo_cultura', 'sanidade', 'gestao', 'outro');--> statement-breakpoint
CREATE TYPE "public"."recomendacao_situacao" AS ENUM('pendente', 'em_andamento', 'adotada', 'nao_adotada');--> statement-breakpoint
CREATE TYPE "public"."resposta_diagnostico" AS ENUM('sim', 'nao', 'parcialmente', 'nao_sei');--> statement-breakpoint
CREATE TYPE "public"."visita_situacao" AS ENUM('agendada', 'realizada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."visita_tipo" AS ENUM('inicial_associacao', 'diagnostico_propriedade', 'assistencia_tecnica', 'acompanhamento');--> statement-breakpoint
CREATE TABLE "visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"tipo" "visita_tipo" NOT NULL,
	"situacao" "visita_situacao" DEFAULT 'agendada' NOT NULL,
	"associacao_id" uuid,
	"propriedade_id" uuid,
	"visita_anterior_id" uuid,
	"data" date NOT NULL,
	"realizada_em" timestamp with time zone,
	"tecnico_id" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"relato" text,
	"noticia_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "visitas_alvo_ck" CHECK (num_nonnulls("visitas"."associacao_id", "visitas"."propriedade_id") = 1),
	CONSTRAINT "visitas_tipo_alvo_ck" CHECK (("visitas"."tipo" = 'inicial_associacao') = ("visitas"."associacao_id" is not null)),
	CONSTRAINT "visitas_realizada_ck" CHECK (("visitas"."situacao" = 'realizada') = ("visitas"."realizada_em" is not null)),
	CONSTRAINT "visitas_coordenadas_ck" CHECK (num_nonnulls("visitas"."latitude", "visitas"."longitude") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "visita_equipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visita_anexos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"tipo" "anexo_tipo" NOT NULL,
	"arquivo_key" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"legenda" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "visita_anexos_tamanho_ck" CHECK ("visita_anexos"."tamanho_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "opcoes_diagnostico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo" "grupo_opcao" NOT NULL,
	"nome" text NOT NULL,
	"permite_detalhe" boolean DEFAULT false NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnosticos_associacao" (
	"associacao_id" uuid PRIMARY KEY NOT NULL,
	"visita_id" uuid,
	"coletado_em" date NOT NULL,
	"analise_solo_recente" "resposta_diagnostico",
	"acesso_maquinario" "resposta_diagnostico",
	"praticas_conservacao" text,
	"participou_cursos" "resposta_diagnostico",
	"interesse_capacitacao" boolean,
	"possui_registro_formal" boolean,
	"possui_local_eventos" boolean,
	"tipo_local_eventos" text,
	"potencial_nao_explorado" text,
	"comentarios" text,
	"revisado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnosticos_propriedade" (
	"visita_id" uuid PRIMARY KEY NOT NULL,
	"area_produtiva_ha" numeric(10, 2),
	"area_pastagem_ha" numeric(10, 2),
	"area_preservada_ha" numeric(10, 2),
	"principais_culturas" text,
	"rebanho_bovino" integer,
	"fonte_agua" text,
	"possui_energia" boolean,
	"possui_irrigacao" boolean,
	"pessoas_trabalham" smallint,
	"analise_solo_recente" "resposta_diagnostico",
	"acesso_maquinario" "resposta_diagnostico",
	"comentarios" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "diagnosticos_propriedade_areas_ck" CHECK (coalesce("diagnosticos_propriedade"."area_produtiva_ha", 0) >= 0 and coalesce("diagnosticos_propriedade"."area_pastagem_ha", 0) >= 0 and coalesce("diagnosticos_propriedade"."area_preservada_ha", 0) >= 0),
	CONSTRAINT "diagnosticos_propriedade_contagens_ck" CHECK (coalesce("diagnosticos_propriedade"."rebanho_bovino", 0) >= 0 and coalesce("diagnosticos_propriedade"."pessoas_trabalham", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "diagnostico_opcoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"associacao_id" uuid,
	"visita_id" uuid,
	"opcao_id" uuid NOT NULL,
	"detalhe" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "diagnostico_opcoes_alvo_ck" CHECK (num_nonnulls("diagnostico_opcoes"."associacao_id", "diagnostico_opcoes"."visita_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "recomendacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"propriedade_id" uuid NOT NULL,
	"visita_id" uuid NOT NULL,
	"categoria" "recomendacao_categoria" NOT NULL,
	"cultura" text,
	"descricao" text NOT NULL,
	"prazo" date,
	"situacao" "recomendacao_situacao" DEFAULT 'pendente' NOT NULL,
	"verificada_em_visita_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_projeto_id_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_propriedade_id_propriedades_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_visita_anterior_id_visitas_id_fk" FOREIGN KEY ("visita_anterior_id") REFERENCES "public"."visitas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_tecnico_id_user_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_equipe" ADD CONSTRAINT "visita_equipe_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_equipe" ADD CONSTRAINT "visita_equipe_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_anexos" ADD CONSTRAINT "visita_anexos_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosticos_associacao" ADD CONSTRAINT "diagnosticos_associacao_associacao_id_associacoes_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."associacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosticos_associacao" ADD CONSTRAINT "diagnosticos_associacao_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosticos_propriedade" ADD CONSTRAINT "diagnosticos_propriedade_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostico_opcoes" ADD CONSTRAINT "diagnostico_opcoes_associacao_id_diagnosticos_associacao_associacao_id_fk" FOREIGN KEY ("associacao_id") REFERENCES "public"."diagnosticos_associacao"("associacao_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostico_opcoes" ADD CONSTRAINT "diagnostico_opcoes_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostico_opcoes" ADD CONSTRAINT "diagnostico_opcoes_opcao_id_opcoes_diagnostico_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcoes_diagnostico"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recomendacoes" ADD CONSTRAINT "recomendacoes_propriedade_id_propriedades_id_fk" FOREIGN KEY ("propriedade_id") REFERENCES "public"."propriedades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recomendacoes" ADD CONSTRAINT "recomendacoes_visita_id_visitas_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visitas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recomendacoes" ADD CONSTRAINT "recomendacoes_verificada_em_visita_id_visitas_id_fk" FOREIGN KEY ("verificada_em_visita_id") REFERENCES "public"."visitas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitas_projeto_tipo_data_idx" ON "visitas" USING btree ("projeto_id","tipo","data");--> statement-breakpoint
CREATE INDEX "visitas_associacao_idx" ON "visitas" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "visitas_propriedade_idx" ON "visitas" USING btree ("propriedade_id");--> statement-breakpoint
CREATE INDEX "visitas_anterior_idx" ON "visitas" USING btree ("visita_anterior_id");--> statement-breakpoint
CREATE INDEX "visitas_tecnico_idx" ON "visitas" USING btree ("tecnico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_equipe_unico_idx" ON "visita_equipe" USING btree ("visita_id","user_id") WHERE "visita_equipe"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "visita_equipe_visita_idx" ON "visita_equipe" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "visita_equipe_user_idx" ON "visita_equipe" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "visita_anexos_visita_idx" ON "visita_anexos" USING btree ("visita_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opcoes_diagnostico_grupo_nome_unico_idx" ON "opcoes_diagnostico" USING btree ("grupo",lower("nome")) WHERE "opcoes_diagnostico"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "diagnosticos_associacao_visita_idx" ON "diagnosticos_associacao" USING btree ("visita_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostico_opcoes_unico_idx" ON "diagnostico_opcoes" USING btree (coalesce("associacao_id", "visita_id"),"opcao_id") WHERE "diagnostico_opcoes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "diagnostico_opcoes_associacao_idx" ON "diagnostico_opcoes" USING btree ("associacao_id");--> statement-breakpoint
CREATE INDEX "diagnostico_opcoes_visita_idx" ON "diagnostico_opcoes" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "diagnostico_opcoes_opcao_idx" ON "diagnostico_opcoes" USING btree ("opcao_id");--> statement-breakpoint
CREATE INDEX "recomendacoes_propriedade_idx" ON "recomendacoes" USING btree ("propriedade_id");--> statement-breakpoint
CREATE INDEX "recomendacoes_visita_idx" ON "recomendacoes" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "recomendacoes_verificada_idx" ON "recomendacoes" USING btree ("verificada_em_visita_id");