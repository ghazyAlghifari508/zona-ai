CREATE TABLE "message_artifact_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"position" integer NOT NULL,
	"title_snapshot" text NOT NULL,
	"kind_snapshot" text NOT NULL,
	"version_snapshot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "message_artifact_mentions_mode_check" CHECK ("message_artifact_mentions"."mode" IN ('context', 'revise')),
	CONSTRAINT "message_artifact_mentions_position_nonnegative_check" CHECK ("message_artifact_mentions"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "message_artifact_mentions" ADD CONSTRAINT "message_artifact_mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_artifact_mentions" ADD CONSTRAINT "message_artifact_mentions_message_scope_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_artifact_mentions" ADD CONSTRAINT "message_artifact_mentions_artifact_version_scope_fk" FOREIGN KEY ("version_id","artifact_id","conversation_id") REFERENCES "public"."artifact_versions"("id","artifact_id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_artifact_mentions_message_artifact_unique" ON "message_artifact_mentions" USING btree ("message_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_artifact_mentions_message_position_unique" ON "message_artifact_mentions" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "message_artifact_mentions_message_id_idx" ON "message_artifact_mentions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_artifact_mentions_artifact_id_idx" ON "message_artifact_mentions" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "message_artifact_mentions_version_id_idx" ON "message_artifact_mentions" USING btree ("version_id");