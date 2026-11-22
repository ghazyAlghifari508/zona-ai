CREATE TABLE "model_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"router_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"vendor" text NOT NULL,
	"description" text NOT NULL,
	"intelligence_level" integer NOT NULL,
	"intelligence_score" integer NOT NULL,
	"intelligence_bars" integer NOT NULL,
	"confidence" text NOT NULL,
	"evaluation_notes" text,
	"last_evaluated" text,
	"credit_cost_min" integer NOT NULL,
	"credit_cost_max" integer NOT NULL,
	"credit_tier" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"search_aliases" jsonb NOT NULL,
	"context_window" integer,
	"max_output" integer,
	"pricing_input" real,
	"pricing_output" real,
	"category" text NOT NULL,
	"speed_class" text NOT NULL,
	"routing_profile" text DEFAULT 'general' NOT NULL,
	"routing_priority" integer DEFAULT 0 NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"evaluation_status" text DEFAULT 'pending' NOT NULL,
	"evaluation_suite_version" text,
	"evidence_ref" text,
	"vision_status" text DEFAULT 'not-tested' NOT NULL,
	"vision_evidence" text,
	"provenance" text NOT NULL,
	"observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "model_catalog_status_check" CHECK ("model_catalog"."evaluation_status" in ('legacy','pending','verified','failed','inconclusive')),
	CONSTRAINT "model_catalog_vision_status_check" CHECK ("model_catalog"."vision_status" in ('supported','unsupported','unverified','inconclusive','not-tested'))
);
--> statement-breakpoint
ALTER TABLE "model_settings" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "model_settings" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_settings" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_aliases" ADD CONSTRAINT "model_aliases_model_id_model_catalog_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_aliases_model_id_idx" ON "model_aliases" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_catalog_router_model_id_unique" ON "model_catalog" USING btree ("router_model_id");--> statement-breakpoint
CREATE INDEX "model_catalog_routing_profile_idx" ON "model_catalog" USING btree ("routing_profile","routing_priority");--> statement-breakpoint
CREATE INDEX "model_catalog_evaluation_status_idx" ON "model_catalog" USING btree ("evaluation_status");--> statement-breakpoint
CREATE INDEX "model_settings_status_idx" ON "model_settings" USING btree ("status");--> statement-breakpoint
ALTER TABLE "model_settings" ADD CONSTRAINT "model_settings_status_check" CHECK ("model_settings"."status" in ('active','inactive','retired'));
--> statement-breakpoint
UPDATE "model_settings" SET "status" = CASE WHEN "is_active" THEN 'active' ELSE 'inactive' END;