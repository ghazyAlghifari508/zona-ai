CREATE TABLE "artifact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_version_id" uuid,
	"attachment_id" uuid NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_sha256" text,
	"created_by_model_id" text NOT NULL,
	"created_by_router_model_id" text NOT NULL,
	"change_summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "artifact_versions_id_artifact_id_unique" UNIQUE("id","artifact_id"),
	CONSTRAINT "artifact_versions_id_conversation_id_unique" UNIQUE("id","conversation_id"),
	CONSTRAINT "artifact_versions_id_artifact_id_conversation_id_unique" UNIQUE("id","artifact_id","conversation_id"),
	CONSTRAINT "artifact_versions_version_positive_check" CHECK ("artifact_versions"."version" > 0),
	CONSTRAINT "artifact_versions_title_length_check" CHECK (char_length("artifact_versions"."title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "artifacts_id_conversation_id_unique" UNIQUE("id","conversation_id"),
	CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind" IN ('prd', 'agent-skill', 'checklist')),
	CONSTRAINT "artifacts_title_length_check" CHECK (char_length("artifacts"."title") <= 200)
);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "request_message_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "source_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_id_conversation_id_unique" UNIQUE("id","conversation_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_id_conversation_id_unique" UNIQUE("id","conversation_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_conversation_id_unique" UNIQUE("id","conversation_id");--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_source_version_id_artifact_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."artifact_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_scope_fk" FOREIGN KEY ("artifact_id","conversation_id") REFERENCES "public"."artifacts"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_source_scope_fk" FOREIGN KEY ("source_version_id","conversation_id") REFERENCES "public"."artifact_versions"("id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_attachment_scope_fk" FOREIGN KEY ("attachment_id","conversation_id") REFERENCES "public"."attachments"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_generation_scope_fk" FOREIGN KEY ("generation_run_id","conversation_id") REFERENCES "public"."generation_runs"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_current_version_scope_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."artifact_versions"("id","artifact_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_versions_artifact_id_version_unique" ON "artifact_versions" USING btree ("artifact_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_versions_attachment_id_unique" ON "artifact_versions" USING btree ("attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_versions_generation_run_id_unique" ON "artifact_versions" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "artifact_versions_source_version_id_idx" ON "artifact_versions" USING btree ("source_version_id");--> statement-breakpoint
CREATE INDEX "artifacts_user_id_conversation_id_idx" ON "artifacts" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "artifacts_conversation_id_updated_at_idx" ON "artifacts" USING btree ("conversation_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "artifacts_conversation_id_kind_idx" ON "artifacts" USING btree ("conversation_id","kind");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_scope_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_request_message_id_messages_id_fk" FOREIGN KEY ("request_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_message_scope_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_request_message_scope_fk" FOREIGN KEY ("request_message_id","conversation_id") REFERENCES "public"."messages"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_source_conversation_scope_fk" FOREIGN KEY ("source_version_id","source_artifact_id","conversation_id") REFERENCES "public"."artifact_versions"("id","artifact_id","conversation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_runs_request_message_id_idx" ON "generation_runs" USING btree ("request_message_id");--> statement-breakpoint
CREATE INDEX "generation_runs_source_version_idx" ON "generation_runs" USING btree ("source_version_id","source_artifact_id");--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_source_identity_check" CHECK (("generation_runs"."source_artifact_id" IS NULL AND "generation_runs"."source_version_id" IS NULL) OR ("generation_runs"."source_artifact_id" IS NOT NULL AND "generation_runs"."source_version_id" IS NOT NULL));--> statement-breakpoint
WITH eligible_generations AS MATERIALIZED (
  SELECT g.message_id, (array_agg(g.id ORDER BY g.id))[1] AS generation_run_id
  FROM generation_runs g
  INNER JOIN messages m ON m.id = g.message_id
  WHERE g.status = 'completed'
    AND g.skill_id IN ('prd-plan', 'agent-skill')
    AND m.role = 'assistant'
  GROUP BY g.message_id
  HAVING count(*) = 1
),
eligible_attachments AS MATERIALIZED (
  SELECT a.message_id, (array_agg(a.id ORDER BY a.id))[1] AS attachment_id
  FROM attachments a
  WHERE a.message_id IS NOT NULL
    AND (a.mime_type = 'text/markdown' OR a.file_name ILIKE '%.md')
  GROUP BY a.message_id
  HAVING count(*) = 1
),
candidates AS MATERIALIZED (
  SELECT
    gen_random_uuid() AS artifact_id,
    gen_random_uuid() AS version_id,
    a.id AS attachment_id,
    a.user_id,
    a.conversation_id,
    a.file_name,
    a.created_at,
    g.id AS generation_run_id,
    g.model_id,
    g.router_model_id,
    CASE g.skill_id
      WHEN 'prd-plan' THEN 'prd'
      WHEN 'agent-skill' THEN 'agent-skill'
    END AS kind
  FROM eligible_generations eg
  INNER JOIN generation_runs g ON g.id = eg.generation_run_id
  INNER JOIN eligible_attachments ea ON ea.message_id = eg.message_id
  INNER JOIN attachments a ON a.id = ea.attachment_id
  INNER JOIN messages m ON m.id = g.message_id
  INNER JOIN conversations c ON c.id = g.conversation_id
  WHERE a.conversation_id = g.conversation_id
    AND m.conversation_id = g.conversation_id
    AND c.user_id = a.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM artifact_versions av
      WHERE av.attachment_id = a.id OR av.generation_run_id = g.id
    )
),
inserted_artifacts AS (
  INSERT INTO artifacts (
    id, user_id, conversation_id, kind, title, current_version_id,
    created_at, updated_at
  )
  SELECT
    artifact_id, user_id, conversation_id, kind, left(file_name, 200), NULL,
    created_at, created_at
  FROM candidates
  RETURNING id
),
inserted_versions AS (
  INSERT INTO artifact_versions (
    id, artifact_id, conversation_id, version, source_version_id,
    attachment_id, generation_run_id, title, content_sha256,
    created_by_model_id, created_by_router_model_id, change_summary, created_at
  )
  SELECT
    c.version_id, c.artifact_id, c.conversation_id, 1, NULL,
    c.attachment_id, c.generation_run_id, left(c.file_name, 200), NULL,
    c.model_id, c.router_model_id, 'Legacy artifact imported', c.created_at
  FROM candidates c
  INNER JOIN inserted_artifacts ia ON ia.id = c.artifact_id
  RETURNING id, artifact_id
)
UPDATE artifacts a
SET current_version_id = iv.id
FROM inserted_versions iv
WHERE a.id = iv.artifact_id;--> statement-breakpoint
WITH eligible_generations AS MATERIALIZED (
  SELECT g.message_id, (array_agg(g.id ORDER BY g.id))[1] AS generation_run_id
  FROM generation_runs g
  INNER JOIN messages m ON m.id = g.message_id
  WHERE g.status = 'completed'
    AND g.skill_id IN ('prd-plan', 'agent-skill')
    AND m.role = 'assistant'
  GROUP BY g.message_id
  HAVING count(*) = 1
),
eligible_attachments AS MATERIALIZED (
  SELECT a.message_id, (array_agg(a.id ORDER BY a.id))[1] AS attachment_id
  FROM attachments a
  WHERE a.message_id IS NOT NULL
    AND (a.mime_type = 'text/markdown' OR a.file_name ILIKE '%.md')
  GROUP BY a.message_id
  HAVING count(*) = 1
),
eligible_repairs AS MATERIALIZED (
  SELECT a.id AS artifact_id, av.id AS version_id
  FROM artifacts a
  INNER JOIN artifact_versions av
    ON av.artifact_id = a.id
   AND av.conversation_id = a.conversation_id
  INNER JOIN eligible_generations eg
    ON eg.generation_run_id = av.generation_run_id
  INNER JOIN generation_runs g
    ON g.id = eg.generation_run_id
   AND g.conversation_id = av.conversation_id
  INNER JOIN eligible_attachments ea
    ON ea.message_id = eg.message_id
   AND ea.attachment_id = av.attachment_id
  INNER JOIN attachments att
    ON att.id = ea.attachment_id
   AND att.conversation_id = av.conversation_id
  INNER JOIN messages m
    ON m.id = g.message_id
   AND m.conversation_id = av.conversation_id
  INNER JOIN conversations c
    ON c.id = av.conversation_id
   AND c.user_id = a.user_id
   AND c.user_id = att.user_id
  WHERE a.current_version_id IS NULL
    AND av.version = 1
    AND av.source_version_id IS NULL
    AND av.content_sha256 IS NULL
    AND av.change_summary = 'Legacy artifact imported'
    AND a.kind = CASE g.skill_id
      WHEN 'prd-plan' THEN 'prd'
      WHEN 'agent-skill' THEN 'agent-skill'
    END
    AND a.title = left(att.file_name, 200)
    AND av.title = left(att.file_name, 200)
    AND NOT EXISTS (
      SELECT 1
      FROM artifact_versions other
      WHERE other.artifact_id = a.id
        AND other.id <> av.id
    )
)
UPDATE artifacts a
SET current_version_id = er.version_id
FROM eligible_repairs er
WHERE a.id = er.artifact_id;
