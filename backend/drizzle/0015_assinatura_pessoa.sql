ALTER TABLE "assinaturas" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinaturas_user_idx" ON "assinaturas" USING btree ("user_id");