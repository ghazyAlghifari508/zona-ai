CREATE TABLE "web_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"snippet" text,
	"score" real,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "web_sources" ADD CONSTRAINT "web_sources_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sources" ADD CONSTRAINT "web_sources_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_sources_generation_run_id_idx" ON "web_sources" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "web_sources_conversation_id_idx" ON "web_sources" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "web_sources_generation_run_id_position_idx" ON "web_sources" USING btree ("generation_run_id","position");