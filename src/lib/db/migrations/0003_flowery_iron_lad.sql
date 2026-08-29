CREATE TABLE "comparison_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"status" text NOT NULL,
	"model_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comparison_runs" ADD CONSTRAINT "comparison_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_runs" ADD CONSTRAINT "comparison_runs_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comparison_runs_conversation_id_idx" ON "comparison_runs" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_comparison_run_id_comparison_runs_id_fk" FOREIGN KEY ("comparison_run_id") REFERENCES "public"."comparison_runs"("id") ON DELETE set null ON UPDATE no action;